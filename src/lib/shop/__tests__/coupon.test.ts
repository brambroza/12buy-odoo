import { describe, expect, it } from 'vitest';
import { evaluateCoupon, normalizeCode, rewardLabel, type CouponDefinition, type CouponReward } from '../coupon';
import { bangkokToday } from '../cart-coupon';

const reward = (patch: Partial<CouponReward> = {}): CouponReward => ({
  type: 'discount', description: '', discount: 10, mode: 'percent', applicability: 'order', maxAmount: 0,
  productIds: [], categoryId: null, unsupported: false, requiredPoints: 1, ...patch,
});

const def = (patch: Partial<CouponDefinition> = {}): CouponDefinition => ({
  code: 'TIRE10', source: 'rule', programId: 9, programName: 'ลด 10%', programType: 'promo_code', trigger: 'with_code', active: true,
  dateFrom: null, dateTo: null, pricelistIds: [], limitUsage: false, maxUsage: 0, usedCount: 0, card: null,
  rules: [{ minimumAmount: 0, minimumQty: 0, anyProduct: true, productIds: [], categoryId: null, unsupported: false }],
  rewards: [reward()], ...patch,
});

const lines = [
  { productId: 1, categoryIds: [11, 1], qty: 4, amount: 10_000 },
  { productId: 2, categoryIds: [12, 1], qty: 2, amount: 3_000 },
];
const ctx = { pricelistId: 9, partnerId: 900, today: '2026-10-28' };

describe('evaluateCoupon', () => {
  it('takes a percentage off the whole order', () => {
    expect(evaluateCoupon(def(), lines, ctx)).toMatchObject({ ok: true, discount: 1300, label: 'ลด 10%' });
  });

  it('caps the discount at the max amount and at the amount it applies to', () => {
    expect(evaluateCoupon(def({ rewards: [reward({ maxAmount: 500 })] }), lines, ctx)).toMatchObject({ discount: 500 });
    expect(evaluateCoupon(def({ rewards: [reward({ mode: 'per_order', discount: 99_999 })] }), lines, ctx)).toMatchObject({ discount: 13_000 });
  });

  it('limits a specific-products reward to matching products or categories', () => {
    expect(evaluateCoupon(def({ rewards: [reward({ applicability: 'specific', productIds: [2] })] }), lines, ctx)).toMatchObject({ discount: 300 });
    expect(evaluateCoupon(def({ rewards: [reward({ applicability: 'specific', categoryId: 11 })] }), lines, ctx)).toMatchObject({ discount: 1000 });
    expect(evaluateCoupon(def({ rewards: [reward({ applicability: 'specific', productIds: [99] })] }), lines, ctx)).toMatchObject({ ok: false });
  });

  it('discounts one unit of the cheapest line', () => {
    expect(evaluateCoupon(def({ rewards: [reward({ applicability: 'cheapest', discount: 100 })] }), lines, ctx)).toMatchObject({ discount: 1500 });
  });

  it('checks the rule minimum amount and quantity on matching products', () => {
    const rules = [{ minimumAmount: 5_000, minimumQty: 3, anyProduct: false, productIds: [2], categoryId: null, unsupported: false }];
    const result = evaluateCoupon(def({ rules }), lines, ctx);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.reason).toContain('5,000');
    expect(evaluateCoupon(def({ rules: [{ ...rules[0], productIds: [1] }] }), lines, ctx)).toMatchObject({ ok: true });
  });

  it('rejects inactive, expired, not-yet-started and pricelist-restricted programs', () => {
    expect(evaluateCoupon(def({ active: false }), lines, ctx)).toMatchObject({ ok: false, reason: 'โค้ดนี้ปิดใช้งานแล้ว' });
    expect(evaluateCoupon(def({ dateTo: '2026-10-27' }), lines, ctx)).toMatchObject({ ok: false, reason: 'โค้ดนี้หมดอายุแล้ว' });
    expect(evaluateCoupon(def({ dateTo: '2026-10-28 16:59:59' }), lines, ctx)).toMatchObject({ ok: true });
    expect(evaluateCoupon(def({ dateFrom: '2026-11-01' }), lines, ctx)).toMatchObject({ ok: false });
    expect(evaluateCoupon(def({ pricelistIds: [7, 8] }), lines, ctx)).toMatchObject({ ok: false, reason: 'โค้ดนี้ใช้กับกลุ่มราคาของร้านไม่ได้' });
    expect(evaluateCoupon(def({ limitUsage: true, maxUsage: 5, usedCount: 5 }), lines, ctx)).toMatchObject({ ok: false });
  });

  it('checks a coupon card: owner, expiry and remaining points; rules are not re-checked', () => {
    const card = { points: 1, expirationDate: null, partnerId: 900, active: true };
    const rules = [{ minimumAmount: 1_000_000, minimumQty: 0, anyProduct: true, productIds: [], categoryId: null, unsupported: false }];
    expect(evaluateCoupon(def({ source: 'card', card, rules }), lines, ctx)).toMatchObject({ ok: true });
    expect(evaluateCoupon(def({ source: 'card', card: { ...card, partnerId: 1 } }), lines, ctx)).toMatchObject({ ok: false, reason: 'คูปองนี้เป็นของลูกค้ารายอื่น' });
    expect(evaluateCoupon(def({ source: 'card', card: { ...card, points: 0 } }), lines, ctx)).toMatchObject({ ok: false, reason: 'คูปองนี้ถูกใช้ไปแล้ว' });
    expect(evaluateCoupon(def({ source: 'card', card: { ...card, expirationDate: '2026-10-01' } }), lines, ctx)).toMatchObject({ ok: false });
  });

  it('refuses rewards the web cannot reproduce', () => {
    for (const rewards of [[reward({ type: 'product' })], [reward(), reward()], [reward({ unsupported: true })]]) {
      expect(evaluateCoupon(def({ rewards }), lines, ctx)).toMatchObject({ ok: false, reason: 'คูปองแบบนี้ยังใช้บนเว็บไม่ได้ ติดต่อฝ่ายขาย' });
    }
    expect(evaluateCoupon(def({ rules: [{ ...def().rules[0], unsupported: true }] }), lines, ctx)).toMatchObject({ ok: false });
  });

  it('multiplies a per-point reward by the card points', () => {
    const card = { points: 3, expirationDate: null, partnerId: null, active: true };
    expect(evaluateCoupon(def({ source: 'card', card, rewards: [reward({ mode: 'per_point', discount: 100 })] }), lines, ctx)).toMatchObject({ discount: 300 });
  });
});

describe('helpers', () => {
  it('normalizes typed codes without changing case', () => {
    expect(normalizeCode('  Tire 10 ')).toBe('Tire10');
  });

  it('labels rewards from their description or settings', () => {
    expect(rewardLabel(reward({ description: 'ลดพิเศษ' }))).toBe('ลดพิเศษ');
    expect(rewardLabel(reward({ mode: 'per_order', discount: 500, applicability: 'specific' }))).toBe('ลด ฿500 สินค้าที่ร่วมรายการ');
  });

  it('uses the Bangkok calendar date', () => {
    expect(bangkokToday(new Date('2026-10-28T18:30:00Z'))).toBe('2026-10-29');
  });
});
