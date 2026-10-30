import type { PriceBook } from '@/lib/admin/types';
import { priceFor, type Catalog } from './catalog';
import type { CatalogProduct, DealerProfile, PaymentMethod } from './types';

/** Odoo pricelist set for this product's family on the dealer, if any (see `DealerProfile.typePricelists`). */
export function typePricelistFor(profile: Pick<DealerProfile, 'typePricelists'>, product: Pick<CatalogProduct, 'dealerType'>): number | null {
  return profile.typePricelists?.[product.dealerType] ?? null;
}

/**
 * Dealer-facing unit price.
 * A pricelist set for the product's family on the dealer wins; then the published web price book
 * (fixed entry → type % over base pricelist → base pricelist); otherwise the dealer's Odoo pricelist.
 */
export function resolvePrice(catalog: Catalog, product: CatalogProduct, profile: DealerProfile, qty = 1, bookOverride?: PriceBook | null): number {
  const typePricelistId = typePricelistFor(profile, product);
  if (typePricelistId) return priceFor(catalog, product, typePricelistId, qty);
  const book = bookOverride === undefined ? profile.priceBook ?? undefined : bookOverride ?? undefined;
  if (!book || book.status !== 'PUBLISHED') return priceFor(catalog, product, profile.pricelistId, qty);
  return priceFromBook(catalog, product, book, qty);
}

/**
 * Odoo pricelist the sale order will carry: the published book's Odoo pricelist when the
 * book was written to Odoo, otherwise the dealer's own pricelist. Coupons restricted to
 * pricelists are checked against this one, as Odoo does.
 */
export function orderPricelistId(profile: Pick<DealerProfile, 'priceBook' | 'pricelistId'>): number {
  const book = profile.priceBook;
  return book?.status === 'PUBLISHED' && book.odooPricelistId ? book.odooPricelistId : profile.pricelistId;
}

/** Price according to one book regardless of its status (used by the admin grid preview). */
export function priceFromBook(catalog: Catalog, product: CatalogProduct, book: PriceBook, qty = 1): number {
  const entry = book.entries[String(product.tmplId)];
  if (entry !== undefined) return entry;
  const base = priceFor(catalog, product, book.basePricelistId, qty);
  const percent = book.typePercent[product.dealerType] ?? 0;
  return Math.round(base * (1 + percent / 100) * 100) / 100;
}

type CashProfile = Pick<DealerProfile, 'credit' | 'cashPercent' | 'typeCashPercents' | 'dealerCashPercents' | 'productCashDiscounts' | 'typePricelists'>;

/** Where a cash discount comes from; `PAIR` = the credit/cash pricelist price difference. */
export type CashRule = { kind: 'PERCENT' | 'BAHT'; value: number; source: 'DEALER' | 'PRODUCT' | 'PRICELIST' } | { kind: 'PAIR' };

/**
 * Cash discount rule for this product (credit dealers only; null for others), first match wins:
 * the dealer's % for the family → the product's own discount (% or baht) → the % of the line's
 * pricelist (the family's own pricelist, else the dealer's main one) → the pricelist pair.
 */
export function cashRuleOf(profile: CashProfile, product: Pick<CatalogProduct, 'dealerType' | 'tmplId'>): CashRule | null {
  if (!profile.credit) return null;
  const dealer = profile.dealerCashPercents?.[product.dealerType];
  if (dealer !== undefined) return { kind: 'PERCENT', value: dealer, source: 'DEALER' };
  const own = profile.productCashDiscounts?.[String(product.tmplId)];
  if (own) return { ...own, source: 'PRODUCT' };
  const pricelistPercent = typePricelistFor(profile, product) ? profile.typeCashPercents?.[product.dealerType] : profile.cashPercent ?? undefined;
  if (pricelistPercent !== undefined && pricelistPercent !== null) return { kind: 'PERCENT', value: pricelistPercent, source: 'PRICELIST' };
  return { kind: 'PAIR' };
}

/** Cash discount % for this product when its rule is a % (see `cashRuleOf`), else null (baht, pair or not a credit dealer). */
export function cashPercentOf(profile: CashProfile, product: Pick<CatalogProduct, 'dealerType' | 'tmplId'>): number | null {
  const rule = cashRuleOf(profile, product);
  return rule?.kind === 'PERCENT' ? rule.value : null;
}

/**
 * Cash discount per base unit for a credit dealer who pays cash, by `cashRuleOf`:
 * a % of the shown price, a fixed baht amount, or credit pricelist price − paired cash pricelist price
 * (the family's own pricelist and its pair when one is set).
 * Never negative and never above the shown price. Returns 0 for non-credit dealers or when nothing is set.
 */
export function cashDiscountPerUnit(catalog: Catalog, product: CatalogProduct, profile: DealerProfile, qty = 1, shownPrice?: number): number {
  const rule = cashRuleOf(profile, product);
  if (!rule) return 0;
  if (rule.kind !== 'PAIR') {
    const price = shownPrice ?? resolvePrice(catalog, product, profile, qty);
    const off = rule.kind === 'PERCENT' ? price * rule.value / 100 : rule.value;
    return round2(Math.min(Math.max(off, 0), price));
  }
  const typePricelistId = typePricelistFor(profile, product);
  const creditPricelistId = typePricelistId ?? profile.pricelistId;
  const cashPricelistId = typePricelistId ? profile.typeCashPricelists?.[product.dealerType] ?? null : profile.cashPricelistId;
  if (!cashPricelistId) return 0;
  const diff = priceFor(catalog, product, creditPricelistId, qty) - priceFor(catalog, product, cashPricelistId, qty);
  const cap = shownPrice ?? resolvePrice(catalog, product, profile, qty);
  return round2(Math.min(Math.max(diff, 0), cap));
}

/** The cash % shared by every discounted line, for labels like "ส่วนลดเงินสด 2%"; null when mixed or from pricelist pairs. */
export function uniformCashPercent(lines: { cashDiscountPerUnit?: number; cashDiscountPercent?: number | null }[]): number | null {
  const percents = new Set(lines.filter((l) => (l.cashDiscountPerUnit ?? 0) > 0).map((l) => l.cashDiscountPercent ?? null));
  const [only] = percents;
  return percents.size === 1 && only !== undefined ? only : null;
}

/** Short VAT note shown next to a price: "รวม VAT", "+VAT 7%" or nothing for VAT-free items. */
export function vatLabel(product: { vatRate: number; vatIncluded: boolean }): string {
  if (!product.vatRate) return '';
  return product.vatIncluded ? 'รวม VAT' : `+VAT ${product.vatRate}%`;
}

type BillLine = { qty: number; unitPrice: number; cashDiscountPerUnit?: number; vatRate?: number; vatIncluded?: boolean };
export type Bill = { subtotal: number; cashDiscount: number; vatAdded: number; vat: number; total: number };

/**
 * Bill totals. The cash discount is applied once at the end of the bill, only when paying cash.
 * Prices of VAT-included products already contain VAT; products whose Odoo tax is not included
 * get VAT added on top (`vatAdded`), exactly as Odoo will, so `total` is what the dealer pays
 * and matches the sale order's `amount_total`. `vat` is the VAT inside `total`.
 */
export function billTotals(lines: BillLine[], method: PaymentMethod): Bill {
  const net = (l: BillLine) => l.qty * (l.unitPrice - (method === 'CASH' ? l.cashDiscountPerUnit ?? 0 : 0));
  const subtotal = round2(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0));
  const cashDiscount = method === 'CASH' ? round2(lines.reduce((sum, l) => sum + l.qty * (l.cashDiscountPerUnit ?? 0), 0)) : 0;
  let vatInside = 0;
  let vatAdded = 0;
  for (const line of lines) {
    const rate = line.vatRate ?? 0;
    if (!rate) continue;
    if (line.vatIncluded === false) vatAdded += round2(net(line) * rate / 100);
    else vatInside += net(line) * rate / (100 + rate);
  }
  vatAdded = round2(vatAdded);
  return { subtotal, cashDiscount, vatAdded, vat: round2(vatInside + vatAdded), total: round2(subtotal - cashDiscount + vatAdded) };
}

/** Takes a coupon discount off a bill's total (never below zero); the VAT inside shrinks in proportion. */
export function withCoupon<T extends { total: number; vat?: number }>(bill: T, couponDiscount: number): T & { couponDiscount: number } {
  const discount = round2(Math.min(Math.max(couponDiscount, 0), bill.total));
  const total = round2(bill.total - discount);
  const vat = bill.vat === undefined ? undefined : bill.total > 0 ? round2(bill.vat * total / bill.total) : 0;
  return { ...bill, couponDiscount: discount, total, ...(vat === undefined ? {} : { vat }) };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
