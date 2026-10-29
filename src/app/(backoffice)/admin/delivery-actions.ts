'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { requireAdmin } from '@/lib/auth/session';
import { flash } from '@/lib/flash';
import { createCarrier, setCarrierActive, updateCarrier } from '@/lib/odoo/delivery-carrier';
import { odooWritesEnabled } from '@/lib/odoo/rpc';
import { clearReferenceCache } from '@/lib/shop/catalog';

const PAGE = '/admin/delivery';

const idSchema = z.coerce.number().int().positive();
const carrierSchema = z.object({
  name: z.string().trim().min(1, 'ตั้งชื่อการจัดส่ง').max(120, 'ชื่อยาวเกิน 120 ตัวอักษร'),
  sequence: z.union([z.literal(''), z.coerce.number().int().min(0).max(10_000)]).transform((v) => (v === '' ? 10 : v)),
  published: z.boolean(),
});

/** Field value as a string ('' when missing). */
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** Where to land after an action: the list with the admin's filter, search and page kept. */
function backTo(formData: FormData, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const key of ['show', 'q']) if (field(formData, key)) params.set(key, field(formData, key));
  const page = Number(field(formData, 'page'));
  if (Number.isInteger(page) && page > 1) params.set('page', String(page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${PAGE}?${query}` : PAGE;
}

/** Error toast, then back to the page (keeping the form open via `extra`). */
async function fail(formData: FormData, title: string, message: string, extra: Record<string, string> = {}): Promise<never> {
  await flash(title, { type: 'error', icon: 'truck', description: message });
  redirect(backTo(formData, { ...extra, error: message }));
}

const odooError = (e: unknown) => (e instanceof Error ? e.message : 'Odoo ไม่ตอบรับ');

/** After a write: new checkouts see the change right away (on this server; others within 5 minutes). */
function refresh() {
  clearReferenceCache();
  revalidatePath(PAGE);
  revalidatePath('/shop/cart');
  revalidatePath('/admin/dealers');
}

/**
 * Creates or edits a delivery method in Odoo (`delivery.carrier`): name, order and whether it is
 * published (the first published one is the default for customers without an assigned method). New methods are free fixed-price methods on the chosen delivery product.
 */
export async function saveCarrierAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = idSchema.safeParse(field(formData, 'id')).data ?? null;
  const formState: Record<string, string> = id ? { edit: String(id) } : { new: '1' };
  if (!odooWritesEnabled()) await fail(formData, 'บันทึกไม่สำเร็จ', 'Odoo อยู่ในโหมดอ่านอย่างเดียว (ODOO_READ_ONLY) จึงแก้การจัดส่งจากเว็บไม่ได้', formState);
  const parsed = carrierSchema.safeParse({ name: field(formData, 'name'), sequence: field(formData, 'sequence'), published: formData.get('published') === 'on' });
  if (!parsed.success) return fail(formData, 'บันทึกไม่สำเร็จ', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง', formState);

  let carrierId: number;
  try {
    if (id) {
      await updateCarrier(id, parsed.data);
      carrierId = id;
    } else {
      const productId = idSchema.safeParse(field(formData, 'productId')).data;
      if (!productId) return fail(formData, 'บันทึกไม่สำเร็จ', 'เลือกสินค้าค่าขนส่ง', formState);
      carrierId = await createCarrier({ ...parsed.data, productId });
    }
  } catch (e) {
    return fail(formData, 'บันทึกเข้า Odoo ไม่สำเร็จ', odooError(e), formState);
  }
  await audit(actor.id, id ? 'delivery.carrier.update' : 'delivery.carrier.create', 'delivery.carrier', String(carrierId), parsed.data);
  refresh();
  await flash(id ? 'บันทึกการจัดส่งแล้ว' : 'เพิ่มการจัดส่งแล้ว', { icon: 'truck', description: `${parsed.data.name}${parsed.data.published ? ' · เปิดบนเว็บ' : ''}` });
  redirect(backTo(formData));
}

/** Publishes / unpublishes one delivery method (`is_published` in Odoo). */
export async function setCarrierPublishedAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = idSchema.safeParse(field(formData, 'id')).data;
  if (!id) redirect(backTo(formData));
  const published = field(formData, 'published') === 'true';
  try {
    await updateCarrier(id, { published });
  } catch (e) {
    return fail(formData, 'อัปเดต Odoo ไม่สำเร็จ', odooError(e));
  }
  await audit(actor.id, published ? 'delivery.carrier.publish' : 'delivery.carrier.unpublish', 'delivery.carrier', String(id));
  refresh();
  await flash(published ? 'เปิดบนเว็บแล้ว' : 'ปิดบนเว็บแล้ว', { type: published ? 'success' : 'info', icon: 'truck', description: field(formData, 'name') || undefined });
  redirect(backTo(formData));
}

/** Archives or restores a delivery method in Odoo (never deleted: old sale orders still point to it). */
export async function setCarrierActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = idSchema.safeParse(field(formData, 'id')).data;
  if (!id) redirect(backTo(formData));
  const active = field(formData, 'active') === 'true';
  try {
    await setCarrierActive(id, active);
  } catch (e) {
    return fail(formData, 'อัปเดต Odoo ไม่สำเร็จ', odooError(e));
  }
  await audit(actor.id, active ? 'delivery.carrier.restore' : 'delivery.carrier.archive', 'delivery.carrier', String(id));
  refresh();
  await flash(active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', { type: active ? 'success' : 'info', icon: 'truck', description: active ? 'ยังไม่เปิดบนเว็บ กด "เปิดบนเว็บ" ถ้าต้องการ' : field(formData, 'name') || undefined });
  redirect(backTo(formData));
}
