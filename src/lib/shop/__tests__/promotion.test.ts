import { describe, expect, it } from 'vitest';
import { evaluateCoupon, evaluatePromotions, linesAfterReward, type CouponDefinition, type CouponLine, type CouponReward } from '../coupon';
import { couponLines } from '../cart-coupon';
import { withCoupon, withPromotion } from '../pricing';
import { packCoupon, unpackCoupon } from '../store';
import type { Catalog } from '../catalog';
import type { CatalogProduct } from '../types';

const AS_MC = 8;
const reward = (patch: Partial<CouponReward> = {}): CouponReward => ({
  id: 11, type: 'discount', description: '', discount: 4, mode: 'percent', applicability: 'order', maxAmount: 0,
  productIds: [], categoryId: null, unsupported: false, requiredPoints: 1, ...patch,
});
/** Same shape as Odoo programs 7/8: AS-MC ครบ X (VAT incl.) → % off the whole order, Default pricelist only. */
const promo = (programId: number, minimumAmount: number, percent: number, patch: Partial<CouponDefinition> = {}): CouponDefinition => ({
  code: '', source: 'rule', programId, programName: `${minimumAmount.toLocaleString('en-US')} ลด ${percent}%`, programType: 'promotion', trigger: 'auto', active: true,
  dateFrom: null, dateTo: null, pricelistIds: [1], limitUsage: false, maxUsage: 0, usedCount: 0, card: null,
  rules: [{ minimumAmount, minimumAmountTaxMode: 'incl', minimumQty: 0, anyProduct: false, productIds: [], categoryId: AS_MC, unsupported: false }],
  rewards: [reward({ id: programId + 3, discount: percent })], ...patch,
});
const ladder = [promo(8, 25_000, 4), promo(7, 70_000, 8.5)];
const ctx = { pricelistId: 1, partnerId: 900, today: '2026-11-27' };
const line = (amount: number, categoryIds = [AS_MC], patch: Partial<CouponLine> = {}): CouponLine => ({ productId: amount, categoryIds, qty: 10, amount, ...patch });

describe('evaluatePromotions', () => {
  it('applies the tier the cart reaches and hints at the next one', () => {
    const out = evaluatePromotions(ladder, [line(30_000), line(5_000, [99])], ctx);
    expect(out.applied).toMatchObject({ programId: 8, rewardId: 11, discount: 1400 }); // 4% of the whole order (35,000)
    expect(out.next).toMatchObject({ programId: 7, remaining: 40_000 }); // only AS-MC counts toward the minimum
  });

  it('gives only the biggest discount when several tiers are met', () => {
    const out = evaluatePromotions(ladder, [line(80_000)], ctx);
    expect(out.applied).toMatchObject({ programId: 7, rewardId: 10, discount: 6800 });
    expect(out.next).toBeNull();
  });

  it('checks the minimum on the full-price threshold, not the amount after cash discount', () => {
    const out = evaluatePromotions(ladder, [line(24_500, [AS_MC], { thresholdIncl: 25_000 })], ctx);
    expect(out.applied).toMatchObject({ programId: 8, discount: 980 });
  });

  it('respects the pricelist, dates and active flag set in Odoo', () => {
    expect(evaluatePromotions(ladder, [line(80_000)], { ...ctx, pricelistId: 7 }).applied).toBeNull();
    expect(evaluatePromotions([promo(8, 25_000, 4, { dateTo: '2026-11-01' })], [line(30_000)], ctx).applied).toBeNull();
    expect(evaluatePromotions([promo(8, 25_000, 4, { active: false })], [line(30_000)], ctx).applied).toBeNull();
  });

  it('skips code programs and rewards the web cannot evaluate', () => {
    expect(evaluatePromotions([promo(8, 0, 4, { trigger: 'with_code' })], [line(30_000)], ctx).applied).toBeNull();
    expect(evaluatePromotions([promo(8, 0, 4, { rewards: [reward({ type: 'product' })] })], [line(30_000)], ctx).applied).toBeNull();
  });

  it('gives no hint when the cart has none of the rule products', () => {
    expect(evaluatePromotions(ladder, [line(10_000, [99])], ctx)).toMatchObject({ applied: null, next: null });
  });

  it('computes a coupon on what the promotion left', () => {
    const out = evaluatePromotions(ladder, [line(30_000)], ctx);
    const coupon: CouponDefinition = { ...promo(20, 0, 10), code: 'X', trigger: 'with_code', programType: 'promo_code', pricelistIds: [], rules: [] };
    expect(evaluateCoupon(coupon, out.lines, ctx)).toMatchObject({ ok: true, discount: 2880 }); // 10% of 28,800
  });
});

describe('linesAfterReward', () => {
  it('spreads the discount over the lines in scope', () => {
    const after = linesAfterReward([line(6000), line(4000, [99])], 1000, { productIds: [], categoryId: AS_MC });
    expect(after.map((l) => l.amount)).toEqual([5000, 4000]);
  });
});

describe('couponLines', () => {
  const catalog = { priceCtx: { categoryParents: new Map([[AS_MC, null]]) } } as unknown as Catalog;
  const product = (patch: Partial<CatalogProduct> = {}) => ({ id: 1, categoryId: AS_MC, vatRate: 7, vatIncluded: true, ...patch }) as CatalogProduct;

  it('uses the net line for the discount and the full price for the minimum', () => {
    const [cash] = couponLines(catalog, [{ product: product(), qty: 10, unitPrice: 1000, cashDiscountPerUnit: 20, freightDiscount: 100 }], 'CASH');
    expect(cash).toMatchObject({ amount: 9700, thresholdIncl: 10_000, thresholdExcl: 9345.79 });
    const [credit] = couponLines(catalog, [{ product: product(), qty: 10, unitPrice: 1000, cashDiscountPerUnit: 20 }], 'CREDIT');
    expect(credit.amount).toBe(10_000);
  });

  it('adds VAT on top for products priced without VAT', () => {
    const [l] = couponLines(catalog, [{ product: product({ vatIncluded: false }), qty: 1, unitPrice: 1000, cashDiscountPerUnit: 0 }], 'CREDIT');
    expect(l).toMatchObject({ amount: 1070, thresholdIncl: 1070, thresholdExcl: 1000 });
  });
});

describe('withPromotion', () => {
  it('comes off the total before the coupon and shrinks the VAT inside', () => {
    const bill = withCoupon(withPromotion({ total: 10_700, vat: 700 }, 428), 1000);
    expect(bill).toMatchObject({ promotionDiscount: 428, couponDiscount: 1000, total: 9272 });
    expect(bill.vat).toBeCloseTo(606.58, 2);
  });
});

describe('packCoupon / unpackCoupon', () => {
  const coupon = { code: 'X', programId: 20, programName: 'ลด', label: 'ลด 10%', discount: 50 };
  const promotion = { programId: 8, rewardId: 11, programName: '25,000 ลด 4%', label: '4% on your order', discount: 1200 };

  it('round-trips both, either, or none through the coupon column', () => {
    expect(unpackCoupon(packCoupon(coupon, promotion))).toEqual({ coupon, promotion });
    expect(unpackCoupon(packCoupon(null, promotion))).toEqual({ coupon: null, promotion });
    expect(unpackCoupon(packCoupon(coupon, null))).toEqual({ coupon, promotion: null });
    expect(packCoupon(null, null)).toBeNull();
    expect(unpackCoupon(coupon)).toEqual({ coupon, promotion: null }); // orders stored before promotions
  });
});
