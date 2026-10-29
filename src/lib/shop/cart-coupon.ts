import { findCoupon } from '@/lib/odoo/loyalty';
import type { Catalog } from './catalog';
import { evaluateCoupon, type CouponLine, type CouponResult } from './coupon';
import { categoryChain } from './price-engine';
import { orderPricelistId } from './pricing';
import type { CatalogProduct, DealerProfile, PaymentMethod } from './types';

export type PricedLine = { product: CatalogProduct; qty: number; unitPrice: number; cashDiscountPerUnit: number };

/** Today in Thailand as YYYY-MM-DD (coupon dates in Odoo are calendar dates). */
export function bangkokToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
}

/** Cart lines as the coupon sees them; cash payment uses the price after the cash discount. */
export function couponLines(catalog: Catalog, lines: PricedLine[], method: PaymentMethod): CouponLine[] {
  return lines.map((l) => ({
    productId: l.product.id,
    categoryIds: categoryChain(l.product.categoryId, catalog.priceCtx.categoryParents),
    qty: l.qty,
    amount: l.qty * (l.unitPrice - (method === 'CASH' ? l.cashDiscountPerUnit : 0)),
  }));
}

/**
 * Looks the code up in Odoo and evaluates it for each payment method the dealer may choose.
 * Odoo errors come back as a failed result so the cart still renders.
 */
export async function checkCartCoupon(code: string, catalog: Catalog, profile: DealerProfile, lines: PricedLine[], methods: PaymentMethod[]): Promise<Partial<Record<PaymentMethod, CouponResult>>> {
  const fail = (reason: string) => Object.fromEntries(methods.map((m) => [m, { ok: false, reason } as CouponResult]));
  let definition;
  try {
    definition = await findCoupon(code);
  } catch {
    return fail('ตรวจโค้ดกับ Odoo ไม่ได้ ลองใหม่อีกครั้ง');
  }
  if (!definition) return fail('ไม่พบโค้ดนี้');
  const ctx = { pricelistId: orderPricelistId(profile), partnerId: profile.odooPartnerId, today: bangkokToday() };
  return Object.fromEntries(methods.map((m) => [m, evaluateCoupon(definition, couponLines(catalog, lines, m), ctx)]));
}
