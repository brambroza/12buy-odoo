'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import * as admin from '@/lib/admin/store';
import { cashDiscountProducts, parseCashDiscount } from '@/lib/admin/cash-discounts';
import type { ProductCashDiscount } from '@/lib/admin/types';
import { audit } from '@/lib/auth/audit';
import { requireAdmin } from '@/lib/auth/session';
import { flash } from '@/lib/flash';
import { getCatalog } from '@/lib/shop/catalog';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';

const PAGE = '/admin/cash-discounts';

/** Field value as a string ('' when missing). */
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** The list filter posted back by the page's forms (`type`, `q`, `set`). */
function filterOf(formData: FormData) {
  const type = field(formData, 'type');
  return {
    type: type in DEALER_TYPE_LABELS ? (type as DealerType) : undefined,
    q: field(formData, 'q').slice(0, 80),
    onlySet: field(formData, 'set') === '1',
  };
}

/** Where to land after an action: the list with the admin's filter, search and page kept. */
function backTo(formData: FormData, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const key of ['type', 'q', 'set']) if (field(formData, key)) params.set(key, field(formData, key));
  const page = Number(field(formData, 'page'));
  if (Number.isInteger(page) && page > 1) params.set('page', String(page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${PAGE}?${query}` : PAGE;
}

function revalidate() {
  revalidatePath(PAGE);
  revalidatePath('/shop', 'layout');
}

/**
 * Saves the rows of one page: `ids` lists the template ids shown, `kind_<id>` / `value_<id>` the discount.
 * A row left as "ไม่ตั้ง" or blank is cleared, so other pages are never touched.
 */
export async function saveCashDiscountsAction(formData: FormData) {
  const actor = await requireAdmin();
  const ids = field(formData, 'ids').split(',').filter((id) => /^\d+$/.test(id));
  const changes: Record<string, ProductCashDiscount | null> = {};
  for (const id of ids) {
    const parsed = parseCashDiscount(field(formData, `kind_${id}`), field(formData, `value_${id}`));
    if (parsed && 'error' in parsed) redirect(backTo(formData, { error: `สินค้า #${id}: ${parsed.error}` }));
    changes[id] = parsed;
  }
  const total = await admin.setProductCashDiscounts(changes);
  await audit(actor.id, 'cashDiscount.products.save', 'AdminState', 'main', { changes });
  revalidate();
  await flash('บันทึกส่วนลดเงินสดแล้ว', { icon: 'save', description: `${ids.length} รายการในหน้านี้ · ตั้งไว้ทั้งหมด ${total} สินค้า` });
  redirect(backTo(formData, { saved: '1' }));
}

/** Sets (or with `clear=1` removes) one discount on every product matching the current filter. */
export async function bulkCashDiscountAction(formData: FormData) {
  const actor = await requireAdmin();
  const clear = field(formData, 'clear') === '1';
  const parsed = clear ? null : parseCashDiscount(field(formData, 'bulkKind'), field(formData, 'bulkValue'));
  if (parsed && 'error' in parsed) redirect(backTo(formData, { error: parsed.error }));
  if (!clear && !parsed) redirect(backTo(formData, { error: 'เลือกชนิดและกรอกส่วนลดก่อน' }));
  const [{ products }, discounts] = await Promise.all([getCatalog(), admin.listProductCashDiscounts()]);
  const rows = cashDiscountProducts(products, discounts, filterOf(formData));
  if (!rows.length) redirect(backTo(formData, { error: 'ไม่มีสินค้าตามตัวกรองนี้' }));
  const changes = Object.fromEntries(rows.map((p) => [String(p.tmplId), parsed]));
  const total = await admin.setProductCashDiscounts(changes);
  await audit(actor.id, clear ? 'cashDiscount.products.bulkClear' : 'cashDiscount.products.bulkSet', 'AdminState', 'main', { filter: filterOf(formData), discount: parsed, count: rows.length });
  revalidate();
  await flash(clear ? 'ล้างส่วนลดเงินสดแล้ว' : 'ตั้งส่วนลดเงินสดแล้ว', { icon: 'save', description: `${rows.length} สินค้าตามตัวกรอง · ตั้งไว้ทั้งหมด ${total} สินค้า` });
  redirect(backTo(formData, { saved: '1' }));
}
