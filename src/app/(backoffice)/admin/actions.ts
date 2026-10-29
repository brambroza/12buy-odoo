'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import * as admin from '@/lib/admin/store';
import { dryRunPublish } from '@/lib/admin/dry-run';
import { clearCatalogCache, getCatalog, getReferenceData, priceFor, searchProducts } from '@/lib/shop/catalog';
import { publishBookToOdoo } from '@/lib/odoo/pricelist-publish';
import type { OdooPublishResult, PriceBook } from '@/lib/admin/types';
import { flash } from '@/lib/flash';
import { returnUrl } from '@/lib/admin/return-url';
import { requireAdmin, requireBackoffice } from '@/lib/auth/session';
import { canSyncOrder, syncOrderToOdoo } from '@/lib/shop/odoo-sync';
import * as shopStore from '@/lib/shop/store';
import { refreshOrderStatuses } from '@/lib/shop/status-sync';
import { ORDER_STATUS_LABELS, type DealerType, type ProtoOrder } from '@/lib/shop/types';

const tierSchema = z.enum(['S', 'M', 'L']);
const typeSchema = z.enum(['CAR', 'TRUCK', 'MOTORCYCLE', 'BATTERY', 'WHEEL']);

/** Back to the admin page the form was posted from (keeps its drawer, search, filter and page), with `changes` applied. */
async function back(prefix: string, changes: Record<string, string | undefined> = {}): Promise<string> {
  return returnUrl((await headers()).get('referer'), prefix, changes);
}

function revalidateAdmin() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
}

// ---------- zones ----------

export async function saveZoneAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.string().optional(), name: z.string().trim().min(1, 'ตั้งชื่อโซน').max(60), provinces: z.array(z.string().max(60)) })
    .safeParse({ id: formData.get('id') || undefined, name: formData.get('name'), provinces: formData.getAll('provinces').map(String) });
  if (!parsed.success) redirect(await back('/admin/zones', { error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }));
  const { provinces } = await getReferenceData();
  const valid = new Set(provinces.map((p) => p.name));
  const kept = parsed.data.provinces.filter((p) => valid.has(p));
  await admin.upsertZone({ ...parsed.data, provinces: kept });
  revalidateAdmin();
  await flash(parsed.data.id ? 'บันทึกโซนราคาแล้ว' : 'สร้างโซนราคาแล้ว', { icon: 'map', description: `${parsed.data.name} · ${kept.length} จังหวัด` });
  redirect(await back('/admin/zones', { edit: undefined, new: undefined }));
}

export async function deleteZoneAction(formData: FormData) {
  await requireAdmin();
  await admin.deleteZone(String(formData.get('id') ?? ''));
  revalidateAdmin();
  await flash('ลบโซนราคาแล้ว', { icon: 'delete', description: 'จังหวัดในโซนนี้กลับไปใช้โซนเริ่มต้น' });
  redirect(await back('/admin/zones', { edit: undefined, new: undefined }));
}

// ---------- customer groups ----------

/** Splits a textarea of product codes (lines, commas or spaces) into template ids known to the catalog. */
function codesToTmplIds(raw: string, byCode: Map<string, number>): { ids: number[]; unknown: string[] } {
  const ids: number[] = [];
  const unknown: string[] = [];
  for (const code of raw.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)) {
    const id = byCode.get(code);
    if (id) ids.push(id); else unknown.push(code);
  }
  return { ids, unknown };
}

/** Creates or updates a customer group: brands, categories and include/exclude product codes. */
export async function saveGroupAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    id: z.string().max(40).optional(),
    name: z.string().trim().min(1, 'ตั้งชื่อกลุ่ม').max(60),
    brands: z.array(z.string().trim().max(20)),
    categoryIds: z.array(z.coerce.number().int().positive()),
    include: z.string().max(20_000),
    exclude: z.string().max(20_000),
  }).safeParse({
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    brands: formData.getAll('brands').map(String),
    categoryIds: formData.getAll('categoryIds').map(String),
    include: String(formData.get('include') ?? ''),
    exclude: String(formData.get('exclude') ?? ''),
  });
  if (!parsed.success) redirect(await back('/admin/groups', { error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }));
  if (parsed.data.id && !(await admin.getGroup(parsed.data.id))) redirect(await back('/admin/groups', { group: undefined }));
  const catalog = await getCatalog();
  const validBrands = new Set(catalog.products.map((p) => p.brand));
  const validCategories = new Set(catalog.products.map((p) => p.categoryId));
  const byCode = new Map(catalog.products.filter((p) => p.code).map((p) => [p.code.toUpperCase(), p.tmplId]));
  const include = codesToTmplIds(parsed.data.include, byCode);
  const exclude = codesToTmplIds(parsed.data.exclude, byCode);
  const group = await admin.upsertGroup({
    id: parsed.data.id,
    name: parsed.data.name,
    brands: parsed.data.brands.filter((b) => validBrands.has(b.toUpperCase())),
    categoryIds: parsed.data.categoryIds.filter((c) => validCategories.has(c)),
    includeTmplIds: include.ids,
    excludeTmplIds: exclude.ids,
  });
  revalidateAdmin();
  const unknown = [...include.unknown, ...exclude.unknown];
  await flash(parsed.data.id ? 'บันทึกกลุ่มลูกค้าแล้ว' : 'สร้างกลุ่มลูกค้าแล้ว', {
    type: unknown.length ? 'warning' : 'success', icon: 'group',
    description: unknown.length ? `${group.name} · ไม่พบรหัสสินค้า ${unknown.length} รายการ` : group.name,
  });
  redirect(await back('/admin/groups', { group: group.id, new: undefined, saved: '1', unknown: unknown.length ? unknown.slice(0, 20).join(', ') : undefined }));
}

export async function deleteGroupAction(formData: FormData) {
  await requireAdmin();
  await admin.deleteGroup(String(formData.get('id') ?? ''));
  revalidateAdmin();
  await flash('ลบกลุ่มลูกค้าแล้ว', { icon: 'delete', description: 'ร้านในกลุ่มนี้กลับไปเห็นสินค้าทุกตัวในประเภทของร้าน' });
  redirect(await back('/admin/groups', { group: undefined, new: undefined }));
}

// ---------- price books ----------

/** Creates (if needed) and opens the book for a zone × tier. */
export async function openBookAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ zoneId: z.string().min(1), tier: tierSchema, basePricelistId: z.coerce.number().int().positive().optional() })
    .safeParse({ zoneId: formData.get('zoneId'), tier: formData.get('tier'), basePricelistId: formData.get('basePricelistId') || undefined });
  if (!parsed.success) redirect('/admin/prices');
  const catalog = await getCatalog();
  const fallback = catalog.pricelists[0]?.id ?? 1;
  const book = await admin.ensureBook(parsed.data.zoneId, parsed.data.tier, parsed.data.basePricelistId ?? fallback);
  await flash('เปิดตารางราคาแล้ว', { icon: 'price', description: `ระดับ ${parsed.data.tier}` });
  redirect(`/admin/prices?book=${book.id}`);
}

/** Saves the whole visible grid: inputs named `price_<tmplId>` (blank = remove entry). */
export async function saveGridAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const book = await admin.getBook(bookId);
  if (!book) redirect('/admin/prices');
  const entries = { ...book.entries };
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith('price_')) continue;
    const tmplId = key.slice(6);
    const value = String(raw).trim().replace(/,/g, '');
    if (!value) { delete entries[tmplId]; continue; }
    const price = Number(value);
    if (Number.isFinite(price) && price >= 0) entries[tmplId] = Math.round(price * 100) / 100;
  }
  await admin.updateBook(bookId, { entries });
  revalidateAdmin();
  await flash('บันทึกราคาแล้ว', { icon: 'save', description: `${Object.keys(entries).length} รายการในตาราง · ยังไม่เผยแพร่จนกว่าจะอนุมัติ` });
  redirect(await back('/admin/prices', { book: bookId, saved: '1' }));
}

export async function saveBookSettingsAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const parsed = z.object({ basePricelistId: z.coerce.number().int().positive() }).safeParse({ basePricelistId: formData.get('basePricelistId') });
  if (!parsed.success || !(await admin.getBook(bookId))) redirect('/admin/prices');
  const typePercent: Partial<Record<DealerType, number>> = {};
  for (const type of typeSchema.options) {
    const raw = String(formData.get(`pct_${type}`) ?? '').trim();
    if (raw) { const n = Number(raw); if (Number.isFinite(n)) typePercent[type] = Math.max(-90, Math.min(300, n)); }
  }
  await admin.updateBook(bookId, { basePricelistId: parsed.data.basePricelistId, typePercent });
  revalidateAdmin();
  await flash('บันทึกการตั้งค่าตารางราคาแล้ว', { icon: 'save' });
  redirect(await back('/admin/prices', { book: bookId, saved: '1' }));
}

/** Copies the computed base-pricelist price (with type %) into fixed entries for the filtered products. */
export async function importPricesAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const book = await admin.getBook(bookId);
  if (!book) redirect('/admin/prices');
  const type = typeSchema.safeParse(formData.get('type')).data;
  const query = String(formData.get('q') ?? '');
  const catalog = await getCatalog();
  const products = searchProducts(catalog, { query, types: typeSchema.options, type });
  const entries = { ...book.entries };
  for (const product of products) {
    const base = priceFor(catalog, product, book.basePricelistId);
    const pct = book.typePercent[product.dealerType] ?? 0;
    entries[String(product.tmplId)] = Math.round(base * (1 + pct / 100) * 100) / 100;
  }
  await admin.updateBook(bookId, { entries });
  revalidateAdmin();
  await flash(`ดึงราคา ${products.length} รายการแล้ว`, { icon: 'import', description: 'คำนวณจาก pricelist ฐาน + % ตามประเภท' });
  redirect(await back('/admin/prices', { book: bookId, saved: '1', type, q: query }));
}

export async function clearEntriesAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  if (await admin.getBook(bookId)) await admin.updateBook(bookId, { entries: {} });
  revalidateAdmin();
  await flash('ล้างราคาในตารางแล้ว', { icon: 'delete' });
  redirect(await back('/admin/prices', { book: bookId }));
}

/**
 * Computes the diff against Odoo WITHOUT writing: compares entries with the
 * fixed items of the target pricelist (an existing Odoo pricelist chosen for
 * comparison, or none = everything would be created).
 */
export async function dryRunAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const book = await admin.getBook(bookId);
  const zone = book && await admin.getZone(book.zoneId);
  if (!book || !zone) redirect('/admin/prices');
  // Default: compare with the pricelist this book was already published to.
  const target = z.coerce.number().int().positive().safeParse(formData.get('targetPricelistId')).data ?? book.odooPricelistId ?? null;
  const catalog = await getCatalog();
  const names = new Map(catalog.products.map((p) => [p.tmplId, p.name]));
  const result = dryRunPublish(book, zone, { pricelistId: target, items: target ? catalog.priceCtx.itemsByPricelist.get(target) ?? [] : [] }, names);
  await admin.updateBook(bookId, { lastDryRun: result });
  revalidateAdmin();
  await flash('ตรวจความต่างกับ Odoo แล้ว', { type: 'info', icon: 'eye', description: `เพิ่ม ${result.create.length} · แก้ ${result.update.length} · ลบ ${result.unlink.length} (ยังไม่เขียน Odoo)` });
  redirect(await back('/admin/prices', { book: bookId, dryrun: '1' }));
}

const personSchema = z.string().trim().min(1, 'ใส่ชื่อผู้ดำเนินการ').max(60);

/** Editor submits the book for approval (2-step publish). */
export async function submitBookAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const person = personSchema.safeParse(formData.get('person'));
  if (!person.success) redirect(await back('/admin/prices', { book: bookId, error: person.error.issues[0].message }));
  const result = await admin.submitBook(bookId, person.data);
  revalidateAdmin();
  if (result.ok) await flash('ส่งขออนุมัติแล้ว', { icon: 'send', description: `ผู้ส่ง ${person.data} · ผู้อนุมัติต้องเป็นคนละคน` });
  redirect(await back('/admin/prices', { book: bookId, ...(result.ok ? { submitted: '1' } : { error: result.reason }) }));
}

/**
 * Writes a published book into its own Odoo pricelist and records the outcome on the book.
 * Skipped (not failed) while Odoo writes are off.
 */
async function pushBookToOdoo(book: PriceBook): Promise<OdooPublishResult | null> {
  const zone = await admin.getZone(book.zoneId);
  if (!zone) return null;
  const catalog = await getCatalog();
  const outcome = await publishBookToOdoo(book, zone, catalog.products);
  await admin.updateBook(book.id, { odooPublish: outcome, odooPricelistId: outcome.pricelistId ?? book.odooPricelistId ?? null });
  if (outcome.status === 'DONE') clearCatalogCache();
  return outcome;
}

/** Toast after a book went (or did not go) to Odoo. */
async function flashOdooPublish(title: string, outcome: OdooPublishResult | null) {
  if (outcome?.status === 'FAILED') await flash(`${title} แต่ส่งเข้า Odoo ไม่สำเร็จ`, { type: 'error', icon: 'publish', description: outcome.error ?? 'ลองกดส่งเข้า Odoo อีกครั้ง' });
  else if (outcome?.status === 'SKIPPED') await flash(title, { type: 'info', icon: 'publish', description: 'ยังไม่เขียน Odoo (ปิดการเขียนอยู่) ร้านเห็นราคาใหม่บนเว็บแล้ว' });
  else await flash(title, { icon: 'publish', description: 'ร้านเห็นราคาใหม่บนเว็บ และอัปเดต pricelist ใน Odoo แล้ว' });
}

/** Approver (must differ from submitter) publishes the book for the web shop, then writes it into Odoo. */
export async function approveBookAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const person = personSchema.safeParse(formData.get('person'));
  if (!person.success) redirect(await back('/admin/prices', { book: bookId, error: person.error.issues[0].message }));
  const result = await admin.approveBook(bookId, person.data);
  if (result.ok) await flashOdooPublish('อนุมัติและเผยแพร่ราคาแล้ว', await pushBookToOdoo(result.book));
  revalidateAdmin();
  redirect(await back('/admin/prices', { book: bookId, ...(result.ok ? { published: '1' } : { error: result.reason }) }));
}

/** Re-sends a published book to Odoo (after a failure, or once writes are switched on). */
export async function republishBookAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const book = await admin.getBook(bookId);
  if (!book || book.status !== 'PUBLISHED') redirect(await back('/admin/prices', { book: bookId }));
  await flashOdooPublish('ส่งตารางราคาเข้า Odoo อีกครั้งแล้ว', await pushBookToOdoo(book));
  revalidateAdmin();
  redirect(await back('/admin/prices', { book: bookId }));
}

export async function rejectBookAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  await admin.rejectBook(bookId);
  revalidateAdmin();
  await flash('ตีกลับตารางราคาแล้ว', { type: 'info', icon: 'reject', description: 'กลับเป็นฉบับร่าง แก้ไขแล้วส่งขออนุมัติใหม่' });
  redirect(await back('/admin/prices', { book: bookId, rejected: '1' }));
}

/**
 * Initial import: for each dealer type, copy the price from the chosen Odoo
 * pricelist into fixed entries (the agreed way to seed the web price tables).
 */
export async function importByTypeAction(formData: FormData) {
  await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const book = await admin.getBook(bookId);
  if (!book) redirect('/admin/prices');
  const catalog = await getCatalog();
  const entries = { ...book.entries };
  let count = 0;
  for (const type of typeSchema.options) {
    const pricelistId = z.coerce.number().int().positive().safeParse(formData.get(`pl_${type}`)).data;
    if (!pricelistId) continue;
    for (const product of catalog.products) {
      if (product.dealerType !== type) continue;
      entries[String(product.tmplId)] = priceFor(catalog, product, pricelistId);
      count += 1;
    }
  }
  await admin.updateBook(bookId, { entries });
  revalidateAdmin();
  await flash(`นำเข้าราคา ${count} รายการแล้ว`, { icon: 'import', description: 'จาก pricelist ใน Odoo ตามประเภทสินค้า' });
  redirect(await back('/admin/prices', { book: bookId, imported: String(count) }));
}

// ---------- credit ↔ cash pricelist pairs ----------

/** Saves which Odoo cash pricelist pairs with each credit pricelist (`cash_<creditId>` = cash id or empty). */
export async function saveCashPairsAction(formData: FormData) {
  await requireAdmin();
  const { pricelists } = await getCatalog();
  const valid = new Set(pricelists.map((p) => p.id));
  const pairs: { creditPricelistId: number; cashPricelistId: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const creditPricelistId = Number(key.match(/^cash_(\d+)$/)?.[1]);
    const cashPricelistId = Number(value);
    if (valid.has(creditPricelistId) && valid.has(cashPricelistId)) pairs.push({ creditPricelistId, cashPricelistId });
  }
  await admin.saveCashPairs(pairs);
  revalidateAdmin();
  await flash('บันทึกคู่ราคาเครดิต–เงินสดแล้ว', { icon: 'price', description: `${pairs.length} คู่ · ใช้คำนวณส่วนลดเงินสดท้ายบิล` });
  redirect('/admin/prices?pairs=1');
}

// ---------- orders ----------

/**
 * Admin confirms/advances an order. Cash orders need a verified slip first; credit orders do not.
 * Confirming (PENDING → PREPARING) also pushes the order to Odoo; a failed push keeps the
 * web confirmation and shows a retry button.
 */
export async function adminAdvanceOrderAction(formData: FormData) {
  await requireBackoffice();
  const id = String(formData.get('orderId') ?? '');
  const order = await shopStore.getOrder(null, id);
  // The form posts the status it was rendered with; a stale/double submit must not skip a step.
  const expected = String(formData.get('expectedStatus') ?? '');
  if (!order || (expected && order.status !== expected)) redirect(await back('/admin/orders'));
  if (order.status === 'PENDING' && !shopStore.isPaymentReady(order)) {
    redirect(await back('/admin/orders', { error: `${order.ref}: ต้องตรวจสลิปก่อนยืนยันออเดอร์` }));
  }
  const advanced = await shopStore.advanceOrder(null, id, String(formData.get('trackingRef') ?? ''), order.status);
  const failure = order.status === 'PENDING' && advanced?.status === 'PREPARING' && canSyncOrder(advanced) ? await pushOrReport(advanced) : null;
  revalidateAdmin();
  if (failure) redirect(await back('/admin/orders', { error: failure }));
  if (advanced && advanced.status !== order.status) {
    await flash(order.status === 'PENDING' ? 'ยืนยันออเดอร์แล้ว' : `เปลี่ยนสถานะเป็น “${ORDER_STATUS_LABELS[advanced.status]}” แล้ว`, {
      icon: advanced.status === 'SHIPPED' ? 'truck' : 'order',
      description: `${order.ref} · ${order.dealerName}${order.status === 'PENDING' && advanced.odoo?.saleOrderName ? ` · Odoo ${advanced.odoo.saleOrderName}` : ''}`,
    });
  }
}

/** Pushes an order to Odoo; returns an error message for the admin, or null on success. */
async function pushOrReport(order: ProtoOrder): Promise<string | null> {
  const result = await syncOrderToOdoo(order);
  if (result.status === 'FAILED') return `${order.ref}: ยืนยันในเว็บแล้ว แต่ส่งเข้า Odoo ไม่สำเร็จ — ${result.error}`;
  if (result.status === 'MISMATCH') return `${order.ref}: สร้าง ${result.saleOrderName} ใน Odoo แล้ว แต่ยอด ${result.amountTotal?.toFixed(2)} ไม่ตรงกับเว็บ ${order.total.toFixed(2)} กรุณาตรวจใน Odoo`;
  return null;
}

/** Re-sends a confirmed order to Odoo (after a failure, or for orders confirmed before the Odoo link existed). */
export async function adminSyncOrderAction(formData: FormData) {
  await requireBackoffice();
  const order = await shopStore.getOrder(null, String(formData.get('orderId') ?? ''));
  if (!order || !canSyncOrder(order)) redirect(await back('/admin/orders'));
  const failure = await pushOrReport(order);
  revalidateAdmin();
  if (failure) redirect(await back('/admin/orders', { error: failure }));
  await flash('ส่งออเดอร์เข้า Odoo สำเร็จ', { icon: 'sync', description: order.ref });
}

export async function verifySlipAction(formData: FormData) {
  await requireBackoffice();
  const order = await shopStore.verifySlip(String(formData.get('orderId') ?? ''));
  revalidateAdmin();
  if (order?.payment.verifiedAt) await flash('ตรวจสลิปแล้ว', { icon: 'check', description: `${order.ref} · กดยืนยันออเดอร์ได้แล้ว` });
}

/** Pulls delivery/invoice/payment status for every order linked to Odoo. */
export async function adminRefreshStatusesAction() {
  await requireBackoffice();
  let message: string;
  try {
    const { checked, changed } = await refreshOrderStatuses();
    message = `ตรวจ ${checked} ออเดอร์จาก Odoo · เปลี่ยนสถานะ ${changed} ออเดอร์`;
    await flash('อัปเดตสถานะจาก Odoo แล้ว', { icon: 'sync', description: message });
  } catch (error) {
    message = `อ่านสถานะจาก Odoo ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`;
    await flash('อ่านสถานะจาก Odoo ไม่สำเร็จ', { type: 'error', icon: 'sync', description: error instanceof Error ? error.message : String(error) });
  }
  revalidateAdmin();
  redirect(await back('/admin/orders', { info: message }));
}

/** Saves the parcel tracking number the warehouse got from the carrier. */
export async function adminSetTrackingAction(formData: FormData) {
  await requireBackoffice();
  const trackingRef = String(formData.get('trackingRef') ?? '');
  const order = await shopStore.setTrackingRef(String(formData.get('orderId') ?? ''), trackingRef);
  revalidateAdmin();
  if (order) await flash(trackingRef.trim() ? 'บันทึกเลขพัสดุแล้ว' : 'ลบเลขพัสดุแล้ว', { icon: 'truck', description: `${order.ref}${trackingRef.trim() ? ` · ${trackingRef.trim()}` : ''}` });
}

export async function adminCancelOrderAction(formData: FormData) {
  await requireBackoffice();
  const order = await shopStore.cancelOrder(null, String(formData.get('orderId') ?? ''));
  revalidateAdmin();
  if (order?.status === 'CANCELLED') await flash('ยกเลิกออเดอร์แล้ว', { icon: 'cancel', description: `${order.ref} · ${order.dealerName}` });
  else if (order) await flash('ยกเลิกไม่ได้', { type: 'error', icon: 'cancel', description: `${order.ref} อยู่ในสถานะ “${ORDER_STATUS_LABELS[order.status]}” แล้ว` });
}
