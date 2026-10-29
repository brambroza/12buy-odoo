'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { requireAdmin } from '@/lib/auth/session';
import { getDealer } from '@/lib/dealers/repo';
import { flash } from '@/lib/flash';
import { codeTaken, createCodeProgram, generateCoupons, setProgramActive, type NewCodeProgram } from '@/lib/odoo/loyalty';
import { odooWritesEnabled } from '@/lib/odoo/rpc';

const PAGE = '/admin/coupons';
const MAX_COUPONS = 500;

const dateSchema = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ไม่ถูกต้อง')]).transform((v) => v || null);
const moneySchema = (max: number) => z.union([z.literal(''), z.coerce.number().min(0).max(max)]).transform((v) => (v === '' ? 0 : v));
const countSchema = (max: number) => z.union([z.literal(''), z.coerce.number().int().min(0).max(max)]).transform((v) => (v === '' ? 0 : v));

const programSchema = z.object({
  name: z.string().trim().min(1, 'ตั้งชื่อโปรแกรม').max(80),
  kind: z.enum(['promo_code', 'coupons']),
  code: z.string().trim().max(30),
  discount: z.coerce.number().positive('ใส่ส่วนลดมากกว่า 0').max(1_000_000),
  mode: z.enum(['percent', 'per_order']),
  applicability: z.enum(['order', 'cheapest', 'specific']),
  categoryId: z.union([z.literal(''), z.coerce.number().int().positive()]).transform((v) => (v === '' ? null : v)),
  maxAmount: moneySchema(1_000_000),
  minimumAmount: moneySchema(100_000_000),
  minimumQty: countSchema(100_000),
  dateFrom: dateSchema,
  dateTo: dateSchema,
  maxUsage: countSchema(1_000_000),
  count: countSchema(MAX_COUPONS),
  dealerId: z.string().max(40),
}).superRefine((v, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (v.kind === 'promo_code' && !/^[A-Za-z0-9_-]{3,30}$/.test(v.code)) issue('โค้ดต้องเป็น A-Z, 0-9, - หรือ _ ยาว 3–30 ตัว');
  if (v.kind === 'coupons' && v.count < 1) issue(`จำนวนคูปองต้อง 1–${MAX_COUPONS} ใบ`);
  if (v.mode === 'percent' && v.discount > 100) issue('ส่วนลดเป็น % ต้องไม่เกิน 100');
  if (v.applicability === 'specific' && !v.categoryId) issue('เลือกหมวดสินค้าที่ได้ส่วนลด');
  if (v.dateFrom && v.dateTo && v.dateTo < v.dateFrom) issue('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
});

/** Field value as a string ('' when missing), so optional inputs parse the same either way. */
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** The list URL with the admin's search and page (hidden `q` / `page` inputs) kept, plus `extra` params. */
function backTo(formData: FormData, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  const q = field(formData, 'q').trim().slice(0, 80);
  if (q) params.set('q', q);
  const page = Number(field(formData, 'page'));
  if (Number.isInteger(page) && page > 1) params.set('page', String(page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${PAGE}?${query}` : PAGE;
}

/** Sends the admin back to the form with an error toast and message. */
async function fail(formData: FormData, kind: string, message: string): Promise<never> {
  await flash('สร้างโปรแกรมไม่สำเร็จ', { type: 'error', icon: 'coupon', description: message });
  redirect(backTo(formData, { new: kind, error: message }));
}

/** Odoo partner of a web dealer, for coupons limited to one shop. */
async function dealerPartner(dealerId: string): Promise<{ partnerId: number | null; error?: string }> {
  if (!dealerId) return { partnerId: null };
  const dealer = await getDealer(dealerId);
  if (!dealer) return { partnerId: null, error: 'ไม่พบร้านที่เลือก' };
  if (!dealer.odooPartnerId) return { partnerId: null, error: `ร้าน ${dealer.name} ยังไม่ผูกกับลูกค้าใน Odoo` };
  return { partnerId: dealer.odooPartnerId };
}

/**
 * Creates a discount-code or coupon program in Odoo (one discount reward), then for coupons
 * generates the single-use codes. Refused while Odoo writes are off, since Odoo holds the codes.
 */
export async function createCouponProgramAction(formData: FormData) {
  const actor = await requireAdmin();
  const kind = field(formData, 'kind') === 'coupons' ? 'coupons' : 'promo_code';
  if (!odooWritesEnabled()) await fail(formData, kind, 'Odoo อยู่ในโหมดอ่านอย่างเดียว (ODOO_READ_ONLY) จึงสร้างคูปองจากเว็บไม่ได้');

  const parsed = programSchema.safeParse(Object.fromEntries(
    ['name', 'kind', 'code', 'discount', 'mode', 'applicability', 'categoryId', 'maxAmount', 'minimumAmount', 'minimumQty', 'dateFrom', 'dateTo', 'maxUsage', 'count', 'dealerId']
      .map((name) => [name, field(formData, name)]),
  ));
  if (!parsed.success) return fail(formData, kind, parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const data = parsed.data;
  const input: NewCodeProgram = {
    name: data.name,
    kind: data.kind,
    code: data.kind === 'promo_code' ? data.code : null,
    discount: data.discount,
    mode: data.mode,
    applicability: data.applicability,
    categoryId: data.applicability === 'specific' ? data.categoryId : null,
    maxAmount: data.maxAmount,
    minimumAmount: data.kind === 'promo_code' ? data.minimumAmount : 0,
    minimumQty: data.kind === 'promo_code' ? data.minimumQty : 0,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    maxUsage: data.maxUsage,
  };
  const partner = data.kind === 'coupons' ? await dealerPartner(data.dealerId) : { partnerId: null };
  if (partner.error) return fail(formData, kind, partner.error);

  // `redirect()` throws, so `fail` stays outside the try blocks.
  let taken = false;
  try {
    taken = Boolean(input.code) && (await codeTaken(input.code as string));
  } catch (error) {
    return fail(formData, kind, error instanceof Error ? error.message : 'อ่านข้อมูลจาก Odoo ไม่ได้');
  }
  if (taken) return fail(formData, kind, `โค้ด ${input.code} มีอยู่แล้วใน Odoo`);

  let programId: number;
  let codes: string[] = [];
  try {
    programId = await createCodeProgram(input);
  } catch (error) {
    return fail(formData, kind, error instanceof Error ? error.message : 'Odoo ไม่ตอบรับ');
  }
  let couponError: string | null = null;
  if (data.kind === 'coupons') {
    try {
      codes = await generateCoupons(programId, { count: data.count, partnerId: partner.partnerId, expirationDate: data.dateTo });
    } catch (error) {
      couponError = error instanceof Error ? error.message : 'Odoo ไม่ตอบรับ';
    }
  }

  await audit(actor.id, 'coupon.program.create', 'loyalty.program', String(programId), { ...input, coupons: codes.length, dealerId: data.dealerId || null });
  revalidatePath(PAGE);
  if (couponError) await flash('สร้างโปรแกรมแล้ว แต่สร้างคูปองไม่สำเร็จ', { type: 'error', icon: 'coupon', description: couponError });
  else await flash('สร้างโปรแกรมใน Odoo แล้ว', { icon: 'coupon', description: input.code ? `โค้ด ${input.code} ใช้ในตะกร้าได้ทันที` : `สร้างคูปอง ${codes.length} ใบ` });
  redirect(backTo(formData, { program: String(programId) }));
}

/** Generates more single-use codes for an existing coupon program. */
export async function generateCouponsAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = z.object({
    programId: z.coerce.number().int().positive(),
    count: z.coerce.number().int().min(1, `จำนวนคูปองต้อง 1–${MAX_COUPONS} ใบ`).max(MAX_COUPONS, `จำนวนคูปองต้อง 1–${MAX_COUPONS} ใบ`),
    dealerId: z.string().max(40),
    expirationDate: dateSchema,
  }).safeParse({ programId: field(formData, 'programId'), count: field(formData, 'count'), dealerId: field(formData, 'dealerId'), expirationDate: field(formData, 'expirationDate') });
  const back = backTo(formData, { program: field(formData, 'programId') });
  const error = async (message: string): Promise<never> => {
    await flash('สร้างคูปองไม่สำเร็จ', { type: 'error', icon: 'coupon', description: message });
    redirect(back);
  };
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const partner = await dealerPartner(parsed.data.dealerId);
  if (partner.error) return error(partner.error);
  let codes: string[];
  try {
    codes = await generateCoupons(parsed.data.programId, { count: parsed.data.count, partnerId: partner.partnerId, expirationDate: parsed.data.expirationDate });
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Odoo ไม่ตอบรับ');
  }
  await audit(actor.id, 'coupon.generate', 'loyalty.program', String(parsed.data.programId), { count: codes.length, dealerId: parsed.data.dealerId || null });
  revalidatePath(PAGE);
  await flash(`สร้างคูปอง ${codes.length} ใบแล้ว`, { icon: 'coupon' });
  redirect(back);
}

/** Archives or restores a program in Odoo. */
export async function setCouponProgramActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const programId = z.coerce.number().int().positive().safeParse(field(formData, 'programId')).data;
  if (!programId) redirect(backTo(formData));
  const active = field(formData, 'active') === 'true';
  try {
    await setProgramActive(programId, active);
  } catch (e) {
    await flash('อัปเดต Odoo ไม่สำเร็จ', { type: 'error', icon: 'coupon', description: e instanceof Error ? e.message : 'Odoo ไม่ตอบรับ' });
    redirect(backTo(formData));
  }
  await audit(actor.id, active ? 'coupon.program.restore' : 'coupon.program.archive', 'loyalty.program', String(programId));
  revalidatePath(PAGE);
  await flash(active ? 'เปิดใช้งานโปรแกรมแล้ว' : 'ปิดใช้งานโปรแกรมแล้ว', { type: active ? 'success' : 'info', icon: 'coupon', description: active ? undefined : 'โค้ดของโปรแกรมนี้ใช้ในตะกร้าไม่ได้แล้ว' });
  redirect(backTo(formData));
}
