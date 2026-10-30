'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { CredentialResult } from '@/components/admin/credential-forms';
import { audit } from '@/lib/auth/audit';
import { generateTempPassword } from '@/lib/auth/password';
import { findResetRequest, resolveResetRequests } from '@/lib/auth/reset-requests';
import { canManageRole, isBackofficeRole, type Role } from '@/lib/auth/roles';
import { parseProfileForm } from '@/lib/auth/profile';
import { requireAdmin, requireBackoffice, revokeAllSessions } from '@/lib/auth/session';
import { createUser, createUserWithHash, findUserByEmail, findUserById, isUniqueViolation, setPassword, updateUser } from '@/lib/auth/users';
import { createDealer, findDealerByTaxId, getDealer, updateDealer } from '@/lib/dealers/repo';
import { clearLeadPassword, findLead, setLeadStatus } from '@/lib/leads/repo';
import { normalizeTaxId, taxIdProblem } from '@/lib/tax-id';
import { formatThaiAddress, parseThaiAddress } from '@/lib/thai-address';
import { ensureDealerPartner } from '@/lib/odoo/dealer-partner';
import { getOdooCustomer, listOdooPricelists, updateOdooCustomerCreditLimit } from '@/lib/odoo/customer-pricing';
import { odooWritesEnabled } from '@/lib/odoo/rpc';
import { clearPartnerCache } from '@/lib/shop/catalog';
import * as admin from '@/lib/admin/store';
import { PROVINCES } from '@/lib/provinces';
import { DEALER_COOKIE, encodeProfile, profileFromDealer } from '@/lib/shop/dealer';
import { flash } from '@/lib/flash';

const typeSchema = z.enum(['CAR', 'TRUCK', 'MOTORCYCLE', 'BATTERY', 'WHEEL']);
const tierSchema = z.enum(['S', 'M', 'L']);
const statusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']);
const provinceSchema = z.string().trim().refine((p) => (PROVINCES as readonly string[]).includes(p), 'เลือกจังหวัด');
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null);
/** Baht amount typed by an admin ("50,000" is fine); blank = null. Two decimals, fits NUMERIC(14,2). */
const optionalBaht = z.string().trim().transform((value, ctx) => {
  const text = value.replace(/,/g, '');
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999_999) {
    ctx.addIssue({ code: 'custom', message: 'จำนวนเงินเครดิตไม่ถูกต้อง (ต้องเป็นตัวเลขไม่ติดลบ)' });
    return z.NEVER;
  }
  return Math.round(amount * 100) / 100;
});

const dealerSchema = z.object({
  name: z.string().trim().min(2, 'กรอกชื่อร้าน').max(120),
  province: provinceSchema,
  types: z.array(typeSchema).min(1, 'เลือกประเภทอย่างน้อย 1'),
  tier: tierSchema,
  status: statusSchema,
  odooPartnerId: z.union([z.literal(''), z.coerce.number().int().positive()]).transform((v) => (v === '' ? null : v)),
  address: optionalText(300),
  phone: optionalText(30),
  lineId: optionalText(60),
  taxId: z.string().trim().max(20).transform((v, ctx) => {
    if (!v) return null;
    const problem = taxIdProblem(v);
    if (problem) {
      ctx.addIssue({ code: 'custom', message: problem });
      return z.NEVER;
    }
    return normalizeTaxId(v);
  }),
  creditEnabled: z.boolean(),
  creditLimit: optionalBaht,
  creditOpening: optionalBaht.transform((v) => v ?? 0),
  typePricelists: z.partialRecord(typeSchema, z.coerce.number().int().positive('เลือกกลุ่มราคาตามประเภทสินค้าไม่ถูกต้อง')),
  typeCashPercents: z.partialRecord(typeSchema, z.coerce.number().min(0, '% ส่วนลดเงินสดต้องไม่ติดลบ').max(50, '% ส่วนลดเงินสดต้องไม่เกิน 50').transform((v) => Math.round(v * 100) / 100)),
  notes: optionalText(500),
}).transform((d) => ({
  ...d,
  // A family pricelist or cash % only matters for families the dealer may buy; drop the rest.
  typePricelists: Object.fromEntries(Object.entries(d.typePricelists).filter(([type]) => d.types.includes(type as z.infer<typeof typeSchema>))),
  typeCashPercents: Object.fromEntries(Object.entries(d.typeCashPercents).filter(([type]) => d.types.includes(type as z.infer<typeof typeSchema>))),
}));

/** `typePricelist_<TYPE>` selects (or `typeCashPercent_<TYPE>` inputs) of the dealer form; blank = use the normal rule for that family. */
function readTypePricelists(formData: FormData, prefix = 'typePricelist_'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const type of typeSchema.options) {
    const value = String(formData.get(`${prefix}${type}`) ?? '').trim();
    if (value) out[type] = value;
  }
  return out;
}

/**
 * Error message when a family pricelist is not an Odoo pricelist. When Odoo cannot be reached the
 * ids are kept as sent (the form then only carries back the ids that were already saved).
 */
async function invalidTypePricelist(typePricelists: Record<string, number>): Promise<string | null> {
  const ids = Object.values(typePricelists);
  if (!ids.length) return null;
  let known: Set<number>;
  try {
    known = new Set((await listOdooPricelists()).map((p) => p.id));
  } catch {
    return null;
  }
  return ids.every((id) => known.has(id)) ? null : 'ไม่พบกลุ่มราคาที่เลือกใน Odoo';
}

function readDealerForm(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? '');
  return dealerSchema.safeParse({
    name: s('name'), province: s('province'), types: formData.getAll('types').map(String), tier: s('tier'), status: s('status'),
    odooPartnerId: s('odooPartnerId').trim(), address: s('address'), phone: s('phone'), lineId: s('lineId'), taxId: s('taxId'), creditEnabled: formData.get('creditEnabled') === 'on', creditLimit: s('creditLimit'), creditOpening: s('creditOpening'), typePricelists: readTypePricelists(formData), typeCashPercents: readTypePricelists(formData, 'typeCashPercent_'), notes: s('notes'),
  });
}

/** Stores the dealer's customer group from the form (`customerGroupId`, blank = no group). Returns the saved id. */
async function saveDealerGroup(dealerId: string, formData: FormData): Promise<string | null> {
  const groupId = String(formData.get('customerGroupId') ?? '').trim();
  await admin.setDealerGroup(dealerId, (await admin.getGroup(groupId)) ? groupId : null);
  return (await admin.groupForDealer(dealerId))?.id ?? null;
}

function revalidate() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
}

/**
 * Where to return after a list action: the form's `back` field when it is a back-office path
 * (keeps the list's search, filter and page), otherwise `fallback`. Blocks open redirects.
 */
function backTo(formData: FormData, fallback: string): string {
  const back = String(formData.get('back') ?? '');
  return /^\/admin(\/|\?|$)/.test(back) && !/[\r\n\\]/.test(back) && !back.startsWith('//') ? back : fallback;
}

/**
 * Copies the dealer's web credit limit to its Odoo partner (`credit_limit`), so accounting sees the same
 * limit. Runs only when the limit changed or the dealer was just linked with a limit, so saving other
 * fields never wipes a limit someone set in Odoo. Returns a warning when Odoo was not updated.
 */
async function syncCreditLimitToOdoo(actorId: string, before: { odooPartnerId: number | null; creditLimit: unknown }, after: { odooPartnerId: number | null; creditLimit: number | null }): Promise<string | null> {
  const previous = before.creditLimit === null ? null : Number(before.creditLimit);
  if (!after.odooPartnerId) return after.creditLimit !== null ? 'ยังไม่ได้ผูกลูกค้า Odoo จึงยังไม่ส่งวงเงินไป Odoo' : null;
  const relinked = before.odooPartnerId !== after.odooPartnerId;
  if (previous === after.creditLimit && !(relinked && after.creditLimit !== null)) return null;
  if (!odooWritesEnabled()) return 'Odoo อยู่ในโหมดอ่านอย่างเดียว (ODOO_READ_ONLY) วงเงินบันทึกเฉพาะบนเว็บ ยังไม่ส่งไป Odoo';
  try {
    await updateOdooCustomerCreditLimit(after.odooPartnerId, after.creditLimit);
  } catch (error) {
    console.error('[admin/dealers] Odoo credit limit write failed', after.odooPartnerId, error instanceof Error ? error.message : error);
    return `ส่งวงเงินไป Odoo ไม่สำเร็จ: ${error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'}`;
  }
  clearPartnerCache();
  await audit(actorId, 'odoo.customer_credit_limit', 'res.partner', String(after.odooPartnerId), { from: relinked ? null : previous, to: after.creditLimit });
  return null;
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Message for a duplicate-key failure on the Dealer table: which of the two unique keys was hit. */
function dealerUniqueMessage(error: unknown): string {
  const text = `${(error as Error)?.message ?? ''} ${(error as { details?: string | null })?.details ?? ''}`;
  return text.includes('taxId') ? 'เลขผู้เสียภาษีนี้มีดีลเลอร์อยู่แล้ว' : 'ลูกค้า Odoo รายนี้ถูกผูกกับดีลเลอร์อื่นแล้ว';
}

/** Error when `taxId` already belongs to another dealer (`exceptId` = the dealer being edited), else null. */
async function taxIdTakenBy(taxId: string | null, exceptId?: string): Promise<string | null> {
  if (!taxId) return null;
  const other = await findDealerByTaxId(taxId);
  return other && other.id !== exceptId ? `เลขผู้เสียภาษีนี้เป็นของดีลเลอร์ "${other.name}" อยู่แล้ว` : null;
}

/** Creates a dealer record manually (optionally linked to an Odoo partner). */
export async function createDealerAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = readDealerForm(formData);
  if (!parsed.success) fail('/admin/dealers', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const pricelistError = await invalidTypePricelist(parsed.data.typePricelists);
  if (pricelistError) fail('/admin/dealers', pricelistError);
  const taxIdError = await taxIdTakenBy(parsed.data.taxId);
  if (taxIdError) fail('/admin/dealers', taxIdError);
  let id: string;
  try {
    const dealer = await createDealer(parsed.data);
    id = dealer.id;
    if (parsed.data.status === 'ACTIVE') await updateDealer(id, { approvedAt: new Date(), approvedById: actor.id });
  } catch (error) {
    if (isUniqueViolation(error)) fail('/admin/dealers', dealerUniqueMessage(error));
    throw error;
  }
  const groupId = await saveDealerGroup(id, formData);
  await audit(actor.id, 'dealer.create', 'Dealer', id, { ...parsed.data, customerGroupId: groupId });
  // A limit typed here goes to the Partner Limit, unless Odoo already has the same one (a dealer made from an
  // Odoo customer starts with its limit), so that writes nothing and gives no read-only warning.
  const odooLimit = parsed.data.creditLimit !== null && parsed.data.odooPartnerId
    ? await getOdooCustomer(parsed.data.odooPartnerId).then((c) => (c ? { odooPartnerId: c.id, creditLimit: c.creditLimit } : null)).catch(() => null)
    : null;
  const odooWarning = parsed.data.creditLimit === null ? null : await syncCreditLimitToOdoo(actor.id, odooLimit ?? { odooPartnerId: null, creditLimit: null }, parsed.data);
  revalidate();
  await flash(odooWarning ? 'สร้างดีลเลอร์แล้ว (วงเงินยังไม่เข้า Odoo)' : 'สร้างดีลเลอร์แล้ว', {
    type: odooWarning ? 'warning' : 'success',
    icon: 'store',
    description: odooWarning ? `${parsed.data.name} · ${odooWarning}` : `${parsed.data.name} · ขั้นต่อไป: สร้างบัญชีเข้าสู่ระบบให้ร้าน`,
  });
  redirect(`/admin/dealers?open=${id}&saved=1`);
}

/** Edits type/tier/status/province/Odoo link of a dealer. Activation stamps approvedAt; suspension signs its users out. */
export async function updateDealerAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get('dealerId') ?? '');
  const before = await getDealer(id);
  if (!before) redirect('/admin/dealers');
  const parsed = readDealerForm(formData);
  if (!parsed.success) fail(`/admin/dealers`, parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const pricelistError = await invalidTypePricelist(parsed.data.typePricelists);
  if (pricelistError) fail('/admin/dealers', pricelistError);
  const taxIdError = await taxIdTakenBy(parsed.data.taxId, id);
  if (taxIdError) fail(`/admin/dealers?open=${id}`, taxIdError);
  const becomingActive = parsed.data.status === 'ACTIVE' && before.status !== 'ACTIVE';
  try {
    await updateDealer(id, { ...parsed.data, ...(becomingActive ? { approvedAt: new Date(), approvedById: actor.id } : {}) });
  } catch (error) {
    if (isUniqueViolation(error)) fail(`/admin/dealers?open=${id}`, dealerUniqueMessage(error));
    throw error;
  }
  if (parsed.data.status === 'SUSPENDED') for (const u of before.users) await revokeAllSessions(u.id);
  const groupBefore = (await admin.groupForDealer(id))?.id ?? null;
  const groupAfter = await saveDealerGroup(id, formData);
  await audit(actor.id, 'dealer.update', 'Dealer', id, { from: { status: before.status, tier: before.tier, types: before.types, creditEnabled: before.creditEnabled, creditLimit: before.creditLimit === null ? null : Number(before.creditLimit), creditOpening: Number(before.creditOpening), typePricelists: before.typePricelists ?? {}, typeCashPercents: before.typeCashPercents ?? {}, customerGroupId: groupBefore }, to: { status: parsed.data.status, tier: parsed.data.tier, types: parsed.data.types, creditEnabled: parsed.data.creditEnabled, creditLimit: parsed.data.creditLimit, creditOpening: parsed.data.creditOpening, typePricelists: parsed.data.typePricelists, typeCashPercents: parsed.data.typeCashPercents, customerGroupId: groupAfter } });
  const odooWarning = await syncCreditLimitToOdoo(actor.id, before, parsed.data);
  revalidate();
  await flash(odooWarning ? 'บันทึกข้อมูลดีลเลอร์แล้ว (วงเงินยังไม่เข้า Odoo)' : 'บันทึกข้อมูลดีลเลอร์แล้ว', {
    type: odooWarning ? 'warning' : 'success',
    icon: 'save',
    description: odooWarning ? `${parsed.data.name} · ${odooWarning}`
      : parsed.data.status === 'SUSPENDED' && before.status !== 'SUSPENDED' ? `${parsed.data.name} · ระงับร้านและออกจากระบบผู้ใช้ทุกคนแล้ว`
      : becomingActive ? `${parsed.data.name} · เปิดใช้งานร้านแล้ว` : parsed.data.name,
  });
  redirect(`/admin/dealers?open=${id}&saved=1`);
}

/**
 * Copies the Odoo Partner Limit (res.partner `credit_limit`) into the dealer's web credit limit, for when
 * accounting set the limit in Odoo. Read-only on the Odoo side, so it works while ODOO_READ_ONLY is on.
 */
export async function pullOdooCreditLimitAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get('dealerId') ?? '');
  const dealer = await getDealer(id);
  if (!dealer) redirect('/admin/dealers');
  if (!dealer.odooPartnerId) fail('/admin/dealers', 'ดีลเลอร์นี้ยังไม่ได้ผูกลูกค้า Odoo');
  let customer: Awaited<ReturnType<typeof getOdooCustomer>>;
  try {
    customer = await getOdooCustomer(dealer.odooPartnerId);
  } catch (error) {
    fail('/admin/dealers', `เชื่อมต่อ Odoo ไม่ได้: ${error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'}`);
  }
  if (!customer) fail('/admin/dealers', 'ไม่พบลูกค้านี้ใน Odoo');
  const before = dealer.creditLimit === null ? null : Number(dealer.creditLimit);
  await updateDealer(id, { creditLimit: customer.creditLimit });
  await audit(actor.id, 'dealer.credit_limit_from_odoo', 'Dealer', id, { from: before, to: customer.creditLimit, odooPartnerId: dealer.odooPartnerId });
  revalidate();
  await flash('ดึงวงเงินจาก Odoo แล้ว', { icon: 'save', description: `${dealer.name} · ${customer.creditLimit === null ? 'ไม่จำกัดวงเงิน' : `วงเงิน ${customer.creditLimit.toLocaleString('th-TH')} บาท`}` });
  redirect(`/admin/dealers?open=${id}&saved=1`);
}

/** Creates a login for a dealer. Returns the temporary password once (only its hash is stored). */
export async function createDealerUserAction(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const actor = await requireAdmin();
  const parsed = z.object({ dealerId: z.string().min(1), name: z.string().trim().min(1, 'กรอกชื่อ').max(80), email: z.string().trim().email('อีเมลไม่ถูกต้อง'), role: z.enum(['DEALER_OWNER', 'DEALER_STAFF']) })
    .safeParse({ dealerId: formData.get('dealerId'), name: formData.get('name'), email: formData.get('email'), role: formData.get('role') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  if (!(await getDealer(parsed.data.dealerId))) return { ok: false, message: 'ไม่พบดีลเลอร์' };
  const tempPassword = generateTempPassword();
  try {
    const user = await createUser({ email: parsed.data.email, name: parsed.data.name, password: tempPassword, role: parsed.data.role, dealerId: parsed.data.dealerId, mustChangePassword: true });
    await audit(actor.id, 'user.create', 'User', user.id, { role: user.role, dealerId: parsed.data.dealerId });
    revalidate();
    await flash('สร้างบัญชีผู้ใช้ร้านแล้ว', { icon: 'user', description: `${user.email} · คัดลอกรหัสชั่วคราวส่งให้ร้านทาง LINE` });
    return { ok: true, message: 'สร้างผู้ใช้แล้ว', email: user.email, tempPassword };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' };
    throw error;
  }
}

/** Issues a new temporary password and signs the user out everywhere. */
export async function resetPasswordAction(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const actor = await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  const target = await findUserById(userId);
  if (!target) return { ok: false, message: 'ไม่พบผู้ใช้' };
  if (!canManageRole(actor.role as Role, target.role as Role)) return { ok: false, message: 'ไม่มีสิทธิ์รีเซ็ตผู้ใช้นี้' };
  const tempPassword = generateTempPassword();
  await setPassword(userId, tempPassword, true);
  await revokeAllSessions(userId);
  await resolveResetRequests(userId, actor.id);
  await audit(actor.id, 'user.reset-password', 'User', userId);
  revalidate();
  await flash('รีเซ็ตรหัสผ่านแล้ว', { icon: 'key', description: `${target.email} · ออกจากระบบทุกอุปกรณ์แล้ว ส่งรหัสชั่วคราวให้ผู้ใช้` });
  return { ok: true, message: 'รีเซ็ตแล้ว', email: target.email, tempPassword };
}

/** Closes a forgot-password request without issuing a new password (spam, or handled another way). */
export async function dismissResetRequestAction(formData: FormData) {
  const actor = await requireAdmin();
  const requestId = String(formData.get('requestId') ?? '');
  const back = backTo(formData, '/admin/users');
  const request = await findResetRequest(requestId);
  if (!request || !canManageRole(actor.role as Role, request.user.role as Role)) redirect(back);
  await resolveResetRequests(request.userId, actor.id, 'DISMISSED');
  await audit(actor.id, 'password-reset.dismiss', 'PasswordResetRequest', requestId);
  revalidate();
  await flash('ปิดคำขอรีเซ็ตรหัสผ่านแล้ว', { type: 'info', icon: 'key', description: request.user.email });
  redirect(back);
}

/** Enables/disables a login. Disabling also revokes sessions. You cannot disable yourself. */
export async function toggleUserActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  const back = backTo(formData, '/admin/users');
  const target = await findUserById(userId);
  if (!target || target.id === actor.id || !canManageRole(actor.role as Role, target.role as Role)) redirect(back);
  await updateUser(userId, { isActive: !target.isActive });
  if (target.isActive) await revokeAllSessions(userId);
  await audit(actor.id, target.isActive ? 'user.deactivate' : 'user.activate', 'User', userId);
  revalidate();
  await flash(target.isActive ? 'ปิดใช้งานผู้ใช้แล้ว' : 'เปิดใช้งานผู้ใช้แล้ว', { icon: target.isActive ? 'userOff' : 'user', description: target.isActive ? `${target.email} · ออกจากระบบทุกอุปกรณ์แล้ว` : target.email });
  redirect(back);
}

/** Staff opens the shop as this dealer (8-hour impersonation cookie). */
export async function openAsDealerAction(formData: FormData) {
  const actor = await requireBackoffice();
  const dealer = await getDealer(String(formData.get('dealerId') ?? ''));
  if (!dealer) redirect('/admin/dealers');
  const profile = await profileFromDealer(dealer);
  const jar = await cookies();
  jar.set(DEALER_COOKIE, encodeProfile(profile), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 });
  await audit(actor.id, 'dealer.impersonate', 'Dealer', dealer.id);
  revalidatePath('/shop', 'layout');
  await flash(`กำลังดูร้านในมุมมองของ ${dealer.name}`, { type: 'info', icon: 'eye', description: 'ราคาและสินค้าตามที่ร้านเห็น · ใช้ได้ 8 ชั่วโมง' });
  redirect('/shop');
}

/**
 * Approve a lead: create an ACTIVE dealer from it (with the sign-up address), link them, create the
 * DEALER_OWNER login from the email + password the shop chose, and create/link its Odoo customer.
 */
export async function approveLeadAction(formData: FormData) {
  const actor = await requireAdmin();
  const leadId = String(formData.get('leadId') ?? '');
  const lead = await findLead(leadId);
  if (!lead || lead.status === 'APPROVED') redirect('/admin/leads');
  const tier = tierSchema.safeParse(formData.get('tier')).data ?? 'M';
  const shipping = parseThaiAddress(lead.address);
  const taxId = normalizeTaxId(lead.taxId);
  // The sign-up refused a tax id that already had a dealer, but one may have been created since (by hand or
  // via /activate); approving would then make a second dealer for the same shop.
  const existing = taxId ? await findDealerByTaxId(taxId) : null;
  if (existing) fail(`/admin/leads?open=${leadId}`, `เลขผู้เสียภาษีนี้เป็นของดีลเลอร์ "${existing.name}" อยู่แล้ว ไม่สร้างร้านซ้ำ ถ้าเป็นร้านเดียวกันให้ปฏิเสธใบสมัครนี้แล้วเพิ่มผู้ใช้ในร้านเดิมแทน`);
  let dealer: Awaited<ReturnType<typeof createDealer>>;
  try {
    dealer = await createDealer({
      name: lead.shopName, province: lead.province, types: lead.types, tier, status: 'ACTIVE', phone: lead.phone, lineId: lead.lineId, taxId,
      ...(shipping ? { address: formatThaiAddress(shipping), shippingAddress: shipping } : {}),
    });
  } catch (error) {
    if (isUniqueViolation(error)) fail(`/admin/leads?open=${leadId}`, dealerUniqueMessage(error));
    throw error;
  }
  await updateDealer(dealer.id, { approvedAt: new Date(), approvedById: actor.id });
  await setLeadStatus(leadId, 'APPROVED', { dealerId: dealer.id });
  await audit(actor.id, 'lead.approve', 'DealerLead', leadId, { dealerId: dealer.id, tier });
  let accountNote = '';
  if (lead.email && lead.passwordHash) {
    if (await findUserByEmail(lead.email)) {
      accountNote = `อีเมล ${lead.email} มีบัญชีอยู่แล้ว ยังไม่ได้สร้างบัญชีให้ร้าน กรุณาสร้างเองด้านล่าง`;
    } else {
      const owner = await createUserWithHash({ email: lead.email, name: lead.shopName, passwordHash: lead.passwordHash, role: 'DEALER_OWNER', dealerId: dealer.id });
      await audit(actor.id, 'user.create', 'User', owner.id, { role: 'DEALER_OWNER', dealerId: dealer.id, via: 'lead' });
    }
    await clearLeadPassword(leadId);
  }
  let odooError = '';
  try {
    const partnerId = await ensureDealerPartner(dealer, (await profileFromDealer(dealer)).pricelistId);
    await audit(actor.id, 'dealer.odoo_link', 'Dealer', dealer.id, { odooPartnerId: partnerId });
  } catch (error) {
    // Approval stands; the partner is created again on the dealer's first confirmed order.
    odooError = error instanceof Error ? error.message : String(error);
  }
  revalidate();
  const problems = [odooError && `อนุมัติแล้ว แต่ยังผูกลูกค้า Odoo ไม่ได้: ${odooError}`, accountNote].filter(Boolean).join(' · ');
  const odooParam = problems ? `&error=${encodeURIComponent(problems)}` : '';
  await flash('อนุมัติใบสมัครแล้ว', {
    type: problems ? 'warning' : 'success', icon: 'store',
    description: problems ? `${lead.shopName} · มีเรื่องต้องตามต่อ ดูรายละเอียดในหน้า` : `${lead.shopName} · สร้างร้านและบัญชีเจ้าของร้านแล้ว`,
  });
  redirect(`/admin/dealers?open=${dealer.id}&fromLead=1${odooParam}`);
}

/** Mark a lead contacted / rejected (or back to new). */
export async function setLeadStatusAction(formData: FormData) {
  const actor = await requireBackoffice();
  const back = backTo(formData, '/admin/leads');
  const parsed = z.object({ leadId: z.string().min(1), status: z.enum(['NEW', 'CONTACTED', 'REJECTED']), note: z.string().trim().max(300) })
    .safeParse({ leadId: formData.get('leadId'), status: formData.get('status'), note: formData.get('note') ?? '' });
  if (!parsed.success) redirect(back);
  await setLeadStatus(parsed.data.leadId, parsed.data.status, { note: parsed.data.note || undefined });
  if (parsed.data.status === 'REJECTED') await clearLeadPassword(parsed.data.leadId);
  await audit(actor.id, `lead.${parsed.data.status.toLowerCase()}`, 'DealerLead', parsed.data.leadId);
  revalidate();
  const leadToast = { CONTACTED: ['บันทึกว่าติดต่อแล้ว', 'send'], REJECTED: ['ปฏิเสธใบสมัครแล้ว', 'reject'], NEW: ['ย้ายกลับเป็นใบสมัครใหม่แล้ว', 'mail'] } as const;
  const [leadTitle, leadIcon] = leadToast[parsed.data.status];
  await flash(leadTitle, { type: parsed.data.status === 'REJECTED' ? 'info' : 'success', icon: leadIcon, description: parsed.data.note || undefined });
  redirect(back);
}

/** Staff accounts (admin / sales / warehouse). Only SUPER_ADMIN may create another SUPER_ADMIN. */
export async function createStaffUserAction(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const actor = await requireAdmin();
  const parsed = z.object({ name: z.string().trim().min(1, 'กรอกชื่อ').max(80), email: z.string().trim().email('อีเมลไม่ถูกต้อง'), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE']) })
    .safeParse({ name: formData.get('name'), email: formData.get('email'), role: formData.get('role') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  if (!canManageRole(actor.role as Role, parsed.data.role)) return { ok: false, message: 'ไม่มีสิทธิ์สร้างผู้ใช้ระดับนี้' };
  const tempPassword = generateTempPassword();
  try {
    const user = await createUser({ email: parsed.data.email, name: parsed.data.name, password: tempPassword, role: parsed.data.role, mustChangePassword: true });
    await audit(actor.id, 'user.create', 'User', user.id, { role: user.role });
    revalidate();
    await flash('สร้างบัญชีพนักงานแล้ว', { icon: 'user', description: `${user.email} · คัดลอกรหัสชั่วคราวส่งให้ผู้ใช้` });
    return { ok: true, message: 'สร้างผู้ใช้แล้ว', email: user.email, tempPassword };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' };
    throw error;
  }
}

/**
 * Admin edits a staff account from the users drawer: name, phone, role (permissions) and active status.
 * The actor must be allowed to manage both the current and the new role, and cannot change their own
 * role or status (that would risk locking everyone out). Deactivating signs the user out everywhere.
 */
export async function updateStaffUserAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  const back = backTo(formData, '/admin/users');
  /** Reopens the drawer with an error; the typed values are lost, so messages stay short and specific. */
  const failEdit = (message: string): never => redirect(`/admin/users?edit=${encodeURIComponent(userId)}&error=${encodeURIComponent(message)}`);
  const target = await findUserById(userId);
  if (!target || !isBackofficeRole(target.role as Role) || !canManageRole(actor.role as Role, target.role as Role)) redirect(back);
  const profile = parseProfileForm(formData);
  const role = z.enum(['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE']).safeParse(formData.get('role'));
  if (!profile.success) return failEdit(profile.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ');
  if (!role.success) return failEdit('เลือกบทบาท');
  const self = target.id === actor.id;
  const nextRole = self ? (target.role as Role) : role.data;
  const nextActive = self ? true : formData.get('isActive') === '1';
  if (!canManageRole(actor.role as Role, nextRole)) return failEdit('ไม่มีสิทธิ์ให้บทบาทนี้');

  await updateUser(userId, { ...profile.data, role: nextRole, isActive: nextActive });
  if (target.isActive && !nextActive) await revokeAllSessions(userId);
  await audit(actor.id, 'user.update', 'User', userId, {
    name: profile.data.name, phone: profile.data.phone,
    ...(nextRole !== target.role && { role: { from: target.role, to: nextRole } }),
    ...(nextActive !== target.isActive && { isActive: nextActive }),
  });
  revalidate();
  await flash('บันทึกผู้ใช้แล้ว', { icon: 'user', description: !nextActive && target.isActive ? `${target.email} · ปิดใช้งานและออกจากระบบทุกอุปกรณ์แล้ว` : target.email });
  redirect(back);
}
