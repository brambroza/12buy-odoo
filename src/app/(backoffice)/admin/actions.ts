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
import { audit } from '@/lib/auth/audit';
import { requireAdmin, requireBackoffice } from '@/lib/auth/session';
import { cancelOrderInOdoo, needsOdooCancel } from '@/lib/odoo/cancel';
import { notifyCreditPaymentReview, notifyOdooFailure, notifyOrderStatus, notifySlipVerified } from '@/lib/notify';
import { canSyncOrder, syncOrderToOdoo } from '@/lib/shop/odoo-sync';
import { creditPaymentsToResend, logCreditPaymentToOdoo } from '@/lib/shop/credit-payment-odoo';
import * as shopStore from '@/lib/shop/store';
import { refreshOrderStatuses } from '@/lib/shop/status-sync';
import { formatAmount } from '@/lib/money';
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

/** Editor submits the book for approval (2-step publish). The submitter is the signed-in user. */
export async function submitBookAction(formData: FormData) {
  const user = await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const result = await admin.submitBook(bookId, { id: user.id, name: user.name });
  revalidateAdmin();
  if (result.ok) {
    await audit(user.id, 'pricebook.submit', 'PriceBook', bookId, { zoneId: result.book.zoneId, tier: result.book.tier, entries: Object.keys(result.book.entries).length });
    await flash('ส่งขออนุมัติแล้ว', { icon: 'send', description: `ผู้ส่ง ${user.name} · ผู้อนุมัติต้องเป็นคนละบัญชี` });
  }
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

/** Approver (a different login than the submitter) publishes the book for the web shop, then writes it into Odoo. */
export async function approveBookAction(formData: FormData) {
  const user = await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const result = await admin.approveBook(bookId, { id: user.id, name: user.name });
  if (result.ok) {
    const outcome = await pushBookToOdoo(result.book);
    await audit(user.id, 'pricebook.approve', 'PriceBook', bookId, { zoneId: result.book.zoneId, tier: result.book.tier, submittedBy: result.book.submittedBy, odoo: outcome?.status ?? null, pricelistId: outcome?.pricelistId ?? null });
    await flashOdooPublish('อนุมัติและเผยแพร่ราคาแล้ว', outcome);
  }
  revalidateAdmin();
  redirect(await back('/admin/prices', { book: bookId, ...(result.ok ? { published: '1' } : { error: result.reason }) }));
}

/** Re-sends a published book to Odoo (after a failure, or once writes are switched on). */
export async function republishBookAction(formData: FormData) {
  const user = await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  const book = await admin.getBook(bookId);
  if (!book || book.status !== 'PUBLISHED') redirect(await back('/admin/prices', { book: bookId }));
  const outcome = await pushBookToOdoo(book);
  await audit(user.id, 'pricebook.republish', 'PriceBook', bookId, { odoo: outcome?.status ?? null });
  await flashOdooPublish('ส่งตารางราคาเข้า Odoo อีกครั้งแล้ว', outcome);
  revalidateAdmin();
  redirect(await back('/admin/prices', { book: bookId }));
}

export async function rejectBookAction(formData: FormData) {
  const user = await requireAdmin();
  const bookId = String(formData.get('bookId') ?? '');
  await admin.rejectBook(bookId);
  await audit(user.id, 'pricebook.reject', 'PriceBook', bookId);
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

/**
 * Saves the cash discount of credit pricelists: `percent_<id>` = cash % (blank = none) and
 * `cash_<creditId>` = paired cash pricelist id or empty. A % wins over the pair.
 */
export async function saveCashPairsAction(formData: FormData) {
  await requireAdmin();
  const { pricelists } = await getCatalog();
  const valid = new Set(pricelists.map((p) => p.id));
  const pairs: { creditPricelistId: number; cashPricelistId: number }[] = [];
  const percents: { pricelistId: number; percent: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const creditPricelistId = Number(key.match(/^cash_(\d+)$/)?.[1]);
    const cashPricelistId = Number(value);
    if (valid.has(creditPricelistId) && valid.has(cashPricelistId)) pairs.push({ creditPricelistId, cashPricelistId });
    const percentPricelistId = Number(key.match(/^percent_(\d+)$/)?.[1]);
    const text = String(value).trim();
    if (!valid.has(percentPricelistId) || !text) continue;
    const percent = Number(text);
    if (!admin.isCashPercent(percent)) redirect('/admin/prices?pairs=open&error=' + encodeURIComponent('% ส่วนลดเงินสดต้องมากกว่า 0 และไม่เกิน 50'));
    percents.push({ pricelistId: percentPricelistId, percent });
  }
  await admin.saveCashPairs(pairs);
  await admin.saveCashPercents(percents);
  revalidateAdmin();
  await flash('บันทึกส่วนลดเงินสดแล้ว', { icon: 'price', description: `${percents.length} pricelist ตั้ง % · ${pairs.length} คู่ราคา · ใช้คำนวณส่วนลดเงินสดท้ายบิล` });
  redirect('/admin/prices?pairs=1');
}

// ---------- orders ----------

/**
 * Admin confirms/advances an order. Cash orders need a verified slip first; credit orders do not.
 * Confirming (PENDING → PREPARING) also pushes the order to Odoo as a confirmed SO with a draft
 * invoice, for cash and credit alike; a failed push keeps the web confirmation and shows a retry button.
 */
export async function adminAdvanceOrderAction(formData: FormData) {
  const user = await requireBackoffice();
  const id = String(formData.get('orderId') ?? '');
  const order = await shopStore.getOrder(null, id);
  // The form posts the status it was rendered with; a stale/double submit must not skip a step.
  const expected = String(formData.get('expectedStatus') ?? '');
  if (!order || (expected && order.status !== expected)) redirect(await back('/admin/orders'));
  if (order.status === 'PENDING' && !shopStore.isPaymentReady(order)) {
    redirect(await back('/admin/orders', { error: `${order.ref}: ต้องตรวจสลิปก่อนยืนยันออเดอร์` }));
  }
  const advanced = await shopStore.advanceOrder(null, id, String(formData.get('trackingRef') ?? ''), order.status, { id: user.id, name: user.name });
  if (advanced && advanced.status !== order.status) {
    await audit(user.id, order.status === 'PENDING' ? 'order.confirm' : 'order.advance', 'ShopOrder', id, { ref: order.ref, from: order.status, to: advanced.status });
    await notifyOrderStatus(advanced);
  }
  const failure = order.status === 'PENDING' && advanced?.status === 'PREPARING' && canSyncOrder(advanced) ? await pushOrReport(advanced) : null;
  revalidateAdmin();
  if (failure) redirect(await back('/admin/orders', { error: failure }));
  if (advanced && advanced.status !== order.status) {
    await flash(order.status === 'PENDING' ? 'ยืนยันออเดอร์แล้ว' : `เปลี่ยนสถานะเป็น “${ORDER_STATUS_LABELS[advanced.status]}” แล้ว`, {
      icon: advanced.status === 'SHIPPED' ? 'truck' : 'order',
      description: `${order.ref} · ${order.dealerName}${order.status === 'PENDING' ? odooSummary(advanced) : ''}`,
    });
  }
}

/** " · Odoo S00077 + ใบแจ้งหนี้ร่าง" for the confirm toast; empty when the order has no SO. */
function odooSummary(order: ProtoOrder): string {
  if (!order.odoo?.saleOrderName) return '';
  return ` · Odoo ${order.odoo.saleOrderName}${order.odoo.invoice ? ` + ใบแจ้งหนี้${order.odoo.invoice.name ? ` ${order.odoo.invoice.name}` : 'ร่าง'}` : ''}`;
}

/** Pushes an order to Odoo; returns an error message for the admin, or null on success. */
async function pushOrReport(order: ProtoOrder): Promise<string | null> {
  const result = await syncOrderToOdoo(order);
  if (result.status === 'FAILED') {
    await notifyOdooFailure(order, 'ส่งออเดอร์เข้า Odoo ', result.error ?? 'unknown');
    return `${order.ref}: ยืนยันในเว็บแล้ว แต่ส่งเข้า Odoo ไม่สำเร็จ — ${result.error}`;
  }
  const problems = [
    result.status === 'MISMATCH' ? `ยอด ${result.amountTotal === undefined || result.amountTotal === null ? '-' : formatAmount(result.amountTotal)} ไม่ตรงกับเว็บ ${formatAmount(order.total)} กรุณาตรวจใน Odoo` : '',
    result.invoiceError ? `สร้างใบแจ้งหนี้ร่างไม่สำเร็จ — ${result.invoiceError} (กด “ส่งเข้า Odoo อีกครั้ง” เพื่อลองใหม่)` : '',
  ].filter(Boolean);
  return problems.length ? `${order.ref}: สร้าง ${result.saleOrderName} ใน Odoo แล้ว แต่${problems.join(' · ')}` : null;
}

/** Re-sends a confirmed order to Odoo (after a failure, or for orders confirmed before the Odoo link existed). */
export async function adminSyncOrderAction(formData: FormData) {
  const user = await requireBackoffice();
  const order = await shopStore.getOrder(null, String(formData.get('orderId') ?? ''));
  if (!order || !canSyncOrder(order)) redirect(await back('/admin/orders'));
  const failure = await pushOrReport(order);
  await audit(user.id, 'order.odoo_resend', 'ShopOrder', order.id, { ref: order.ref, ok: !failure });
  revalidateAdmin();
  if (failure) redirect(await back('/admin/orders', { error: failure }));
  const sent = await shopStore.getOrder(null, order.id);
  await flash('ส่งออเดอร์เข้า Odoo สำเร็จ', { icon: 'sync', description: `${order.ref}${sent ? odooSummary(sent) : ''}` });
}

/**
 * Admin checks a transfer a dealer reported on a credit order: VERIFIED (money arrived, amount right) or
 * REJECTED with a reason (the dealer sees it and sends a new slip). Either way a note goes to the Odoo chatter.
 * Verifying does not mark the order PAID: accounting registers the payment in Odoo and the status sync follows.
 */
export async function reviewCreditPaymentAction(formData: FormData) {
  const user = await requireBackoffice();
  const parsed = z.object({ orderId: z.string().min(1), paymentId: z.string().min(1), decision: z.enum(['VERIFIED', 'REJECTED']), reason: z.string().trim().max(300).optional().default('') })
    .safeParse({ orderId: formData.get('orderId'), paymentId: formData.get('paymentId'), decision: formData.get('decision'), reason: formData.get('reason') ?? '' });
  if (!parsed.success) redirect(await back('/admin/orders', { error: 'ข้อมูลไม่ครบ' }));
  const { orderId, paymentId, decision, reason } = parsed.data;
  if (decision === 'REJECTED' && !reason) redirect(await back('/admin/orders', { error: 'ระบุเหตุผลที่สลิปไม่ผ่าน เพื่อให้ร้านแก้ไขได้' }));
  const result = await shopStore.reviewCreditPayment(orderId, paymentId, decision, reason);
  if (!result?.payment) redirect(await back('/admin/orders', { error: 'รายการนี้ถูกตรวจไปแล้วหรือไม่พบ' }));
  await audit(user.id, decision === 'VERIFIED' ? 'order.credit_payment.verify' : 'order.credit_payment.reject', 'ShopOrder', orderId, { ref: result.order.ref, paymentId, amount: result.payment.amount, reason: reason || undefined });
  await notifyCreditPaymentReview(result.order, { amount: result.payment.amount, status: decision, rejectReason: reason || null });
  const log = result.order.odoo?.saleOrderId ? await logCreditPaymentToOdoo(result.order, result.payment, { reviewer: user.name ?? user.email }) : null;
  revalidateAdmin();
  const odooNote = !log ? ' · ยังไม่มี SO ใน Odoo จึงไม่ได้บันทึก' : log.error ? ` · บันทึกเข้า Odoo ไม่สำเร็จ: ${log.error}` : ' · บันทึกเข้า Odoo แล้ว';
  await flash(decision === 'VERIFIED' ? 'ตรวจสลิปชำระเครดิตแล้ว' : 'ปฏิเสธสลิปแล้ว', {
    type: log?.error ? 'warning' : decision === 'VERIFIED' ? 'success' : 'warning', icon: decision === 'VERIFIED' ? 'check' : 'reject',
    description: `${result.order.ref} · ${formatAmount(result.payment.amount)} บาท${decision === 'VERIFIED' ? ' · บัญชีลงรับชำระในใบแจ้งหนี้ Odoo' : ''}${odooNote}`,
  });
}

/** Resends the chatter note for every credit payment of an order whose last note failed. */
export async function resendCreditPaymentLogAction(formData: FormData) {
  await requireBackoffice();
  const order = await shopStore.getOrder(null, String(formData.get('orderId') ?? ''));
  if (!order) redirect(await back('/admin/orders'));
  const targets = creditPaymentsToResend(order);
  const errors: string[] = [];
  for (const payment of targets) {
    const log = await logCreditPaymentToOdoo(order, payment);
    if (log.error) errors.push(log.error);
  }
  revalidateAdmin();
  if (errors.length) redirect(await back('/admin/orders', { error: `${order.ref}: บันทึกเข้า Odoo ไม่สำเร็จ · ${errors[0]}` }));
  await flash('บันทึกการชำระเข้า Odoo แล้ว', { icon: 'sync', description: `${order.ref} · ${targets.length} รายการ` });
}

export async function verifySlipAction(formData: FormData) {
  const user = await requireBackoffice();
  const order = await shopStore.verifySlip(String(formData.get('orderId') ?? ''));
  revalidateAdmin();
  if (order?.payment.verifiedAt) {
    await audit(user.id, 'order.slip.verify', 'ShopOrder', order.id, { ref: order.ref, total: order.total });
    await notifySlipVerified(order);
  }
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
  const user = await requireBackoffice();
  const trackingRef = String(formData.get('trackingRef') ?? '');
  const order = await shopStore.setTrackingRef(String(formData.get('orderId') ?? ''), trackingRef);
  if (order) await audit(user.id, 'order.tracking', 'ShopOrder', order.id, { ref: order.ref, trackingRef: trackingRef.trim() || null });
  revalidateAdmin();
  if (order) await flash(trackingRef.trim() ? 'บันทึกเลขพัสดุแล้ว' : 'ลบเลขพัสดุแล้ว', { icon: 'truck', description: `${order.ref}${trackingRef.trim() ? ` · ${trackingRef.trim()}` : ''}` });
}

/**
 * Admin cancels a web order. When the order already has an SO in Odoo, the SO (and its draft invoice)
 * is cancelled there too; a posted invoice blocks that part and the admin is told what accounting must do.
 */
export async function adminCancelOrderAction(formData: FormData) {
  const user = await requireBackoffice();
  const id = String(formData.get('orderId') ?? '');
  const before = await shopStore.getOrder(null, id);
  const order = await shopStore.cancelOrder(null, id, { id: user.id, name: user.name });
  const cancelledNow = Boolean(before && before.status !== 'CANCELLED' && order?.status === 'CANCELLED');
  let odooNote = '';
  if (cancelledNow && order && needsOdooCancel(order)) {
    const outcome = await cancelOrderInOdoo(order);
    await shopStore.setOdooCancel(order.id, outcome);
    odooNote = outcome.ok ? ` · ${outcome.note ?? 'ยกเลิกใน Odoo แล้ว'}` : ` · Odoo: ${outcome.error}`;
    if (!outcome.ok) await notifyOdooFailure(order, 'ยกเลิก SO ใน Odoo ', outcome.error ?? 'unknown');
  }
  if (cancelledNow && order) {
    await audit(user.id, 'order.cancel', 'ShopOrder', order.id, { ref: order.ref, from: before?.status, odoo: odooNote || undefined });
    await notifyOrderStatus(order, 'CANCELLED');
  }
  revalidateAdmin();
  if (cancelledNow && order) await flash('ยกเลิกออเดอร์แล้ว', { type: odooNote.includes('Odoo:') ? 'warning' : 'success', icon: 'cancel', description: `${order.ref} · ${order.dealerName}${odooNote}` });
  else if (order) await flash('ยกเลิกไม่ได้', { type: 'error', icon: 'cancel', description: `${order.ref} อยู่ในสถานะ “${ORDER_STATUS_LABELS[order.status]}” แล้ว` });
}

/** Retries the Odoo side of a cancel that failed (e.g. after accounting credit-noted the invoice). */
export async function adminRetryOdooCancelAction(formData: FormData) {
  const user = await requireBackoffice();
  const order = await shopStore.getOrder(null, String(formData.get('orderId') ?? ''));
  if (!order || order.status !== 'CANCELLED' || !needsOdooCancel(order)) redirect(await back('/admin/orders'));
  const outcome = await cancelOrderInOdoo(order);
  await shopStore.setOdooCancel(order.id, outcome);
  await audit(user.id, 'order.odoo_cancel_retry', 'ShopOrder', order.id, { ref: order.ref, ok: outcome.ok, error: outcome.error });
  revalidateAdmin();
  if (outcome.ok) await flash('ยกเลิก SO ใน Odoo แล้ว', { icon: 'cancel', description: `${order.ref} · ${outcome.note ?? ''}` });
  else redirect(await back('/admin/orders', { error: `${order.ref}: ${outcome.error}` }));
}
