import { findCoupon, listAutoPromotions } from '@/lib/odoo/loyalty';
import type { Catalog } from './catalog';
import { evaluateCoupon, evaluatePromotions, type CouponLine, type CouponResult, type PromotionOutcome } from './coupon';
import { categoryChain } from './price-engine';
import { orderPricelistId } from './pricing';
import type { CatalogProduct, DealerProfile, PaymentMethod } from './types';

/** A cart line as priced by the web; `freightDiscount` is baht off the whole line (any payment method). */
export type PricedLine = { product: CatalogProduct; qty: number; unitPrice: number; cashDiscountPerUnit: number; freightDiscount?: number };

/** Automatic promotion and coupon (null = no code in the cart) of a cart for one payment method. */
export type CartDiscounts = { promotion: PromotionOutcome; coupon: CouponResult | null };

const round2 = (n: number) => Math.round(n * 100) / 100;
const NO_PROMOTION: PromotionOutcome = { applied: null, next: null };

/** Today in Thailand as YYYY-MM-DD (coupon dates in Odoo are calendar dates). */
export function bangkokToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
}

/**
 * Cart lines as Odoo Loyalty sees them on the SO: `amount` = the line after its cash discount (cash only)
 * and freight discount, VAT included; the thresholds are the line at full price with/without VAT,
 * since the end-of-bill discount lines are not products of a rule.
 */
export function couponLines(catalog: Catalog, lines: PricedLine[], method: PaymentMethod): CouponLine[] {
  return lines.map((l) => {
    const rate = l.product.vatRate ?? 0;
    const vatOnTop = rate > 0 && l.product.vatIncluded === false;
    const gross = l.qty * l.unitPrice;
    const net = Math.max(0, l.qty * (l.unitPrice - (method === 'CASH' ? l.cashDiscountPerUnit : 0)) - (l.freightDiscount ?? 0));
    return {
      productId: l.product.id,
      categoryIds: categoryChain(l.product.categoryId, catalog.priceCtx.categoryParents),
      qty: l.qty,
      amount: round2(vatOnTop ? net * (1 + rate / 100) : net),
      thresholdIncl: round2(vatOnTop ? gross * (1 + rate / 100) : gross),
      thresholdExcl: round2(vatOnTop || !rate ? gross : gross * 100 / (100 + rate)),
    };
  });
}

/**
 * Automatic promotion and (when `code` is set) coupon for each payment method the dealer may choose.
 * The promotion is applied first and the coupon computed on what is left, the order Odoo applies them
 * in when the SO is pushed. Odoo errors leave the promotion out and fail the coupon, so the cart still renders.
 */
export async function checkCartDiscounts(code: string | null, catalog: Catalog, profile: DealerProfile, lines: PricedLine[], methods: PaymentMethod[]): Promise<Partial<Record<PaymentMethod, CartDiscounts>>> {
  const ctx = { pricelistId: orderPricelistId(profile), partnerId: profile.odooPartnerId, today: bangkokToday() };
  const [promotions, definition] = await Promise.all([
    listAutoPromotions().catch(() => []),
    code ? findCoupon(code).catch(() => undefined) : Promise.resolve(null),
  ]);
  return Object.fromEntries(methods.map((m) => {
    const evaluated = promotions.length ? evaluatePromotions(promotions, couponLines(catalog, lines, m), ctx) : { ...NO_PROMOTION, lines: couponLines(catalog, lines, m) };
    const { lines: afterPromotion, ...promotion } = evaluated;
    const coupon: CouponResult | null = !code ? null
      : definition === undefined ? { ok: false, reason: 'ตรวจโค้ดกับ Odoo ไม่ได้ ลองใหม่อีกครั้ง' }
      : !definition ? { ok: false, reason: 'ไม่พบโค้ดนี้' }
      : evaluateCoupon(definition, afterPromotion, ctx);
    return [m, { promotion, coupon }];
  }));
}
