/**
 * Cash discount per product (admin page /admin/cash-discounts): which Odoo products the list shows
 * and how a form value becomes a discount. Pure functions shared by the page and its actions.
 */
import type { CatalogProduct, DealerType } from '@/lib/shop/types';
import { matchesSearch, searchText } from './list';
import type { ProductCashDiscount } from './types';

export type CashDiscountFilter = { type?: DealerType; q?: string; onlySet?: boolean };

/** One row per product template (variants share the template's discount), sorted by family, brand, name. */
export function cashDiscountProducts(products: readonly CatalogProduct[], discounts: Record<string, ProductCashDiscount>, filter: CashDiscountFilter): CatalogProduct[] {
  const q = searchText(filter.q);
  const seen = new Set<number>();
  const rows: CatalogProduct[] = [];
  for (const p of products) {
    if (seen.has(p.tmplId)) continue;
    seen.add(p.tmplId);
    if (filter.type && p.dealerType !== filter.type) continue;
    if (filter.onlySet && !discounts[String(p.tmplId)]) continue;
    if (!matchesSearch(q, p.name, p.code, p.brand, p.size?.label)) continue;
    rows.push(p);
  }
  return rows.sort((a, b) => a.dealerType.localeCompare(b.dealerType) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
}

/**
 * Discount from the form's kind (`PERCENT` / `BAHT` / anything else = none) and value.
 * Returns null for "no discount", or an error message when the value is out of range.
 */
export function parseCashDiscount(kind: string, rawValue: string): ProductCashDiscount | null | { error: string } {
  const text = rawValue.trim().replace(/,/g, '');
  if ((kind !== 'PERCENT' && kind !== 'BAHT') || !text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return { error: 'ส่วนลดต้องมากกว่า 0' };
  if (kind === 'PERCENT' && value > 50) return { error: 'ส่วนลดเงินสดต้องไม่เกิน 50%' };
  if (kind === 'BAHT' && value > 100_000) return { error: 'ส่วนลดต่อหน่วยต้องไม่เกิน 100,000 บาท' };
  return { kind, value: Math.round(value * 100) / 100 };
}

/** "2%" or "฿50.00 /เส้น" for the list and the shop. */
export function formatCashDiscount(discount: ProductCashDiscount, baseUnit?: string): string {
  if (discount.kind === 'PERCENT') return `${discount.value}%`;
  const amount = discount.value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `฿${amount}${baseUnit ? ` /${baseUnit}` : ''}`;
}
