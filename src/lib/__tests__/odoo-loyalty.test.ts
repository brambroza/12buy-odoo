import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/odoo/rpc', () => ({ odooSearchRead: vi.fn(), odooRead: vi.fn(), odooWrite: vi.fn() }));
const { buildProgramValues, generateCoupons, toDefinition } = await import('@/lib/odoo/loyalty');
const rpc = await import('@/lib/odoo/rpc');

const program = {
  id: 9, name: 'ลด 500', program_type: 'promo_code', trigger: 'with_code' as const, active: true,
  date_from: false as const, date_to: '2026-12-31' as string | false, pricelist_ids: [9], limit_usage: false, max_usage: 0, total_order_count: 3,
};
const rule = (patch: object = {}) => ({
  id: 1, mode: 'with_code' as const, code: 'TIRE500', minimum_amount: 5000, minimum_qty: 0, any_product: false,
  valid_product_ids: [] as number[], product_ids: [] as number[], product_category_id: false as const, product_tag_id: false as [number, string] | false, product_domain: '[]', ...patch,
});
const reward = {
  id: 2, reward_type: 'discount' as const, description: 'ลด 500 บาท', discount: 500, discount_mode: 'per_order' as const, discount_applicability: 'order' as const,
  discount_max_amount: 0, required_points: 1, all_discount_product_ids: [], discount_product_ids: [], discount_product_category_id: false as const, discount_product_tag_id: false as const, discount_product_domain: '[]',
};

describe('toDefinition', () => {
  it('keeps only the code rule that matched plus automatic rules', () => {
    const def = toDefinition('TIRE500', program, [rule(), rule({ id: 3, code: 'OTHER' }), rule({ id: 4, mode: 'auto', code: false })], [reward], null, 1);
    expect(def.rules).toHaveLength(2);
    expect(def).toMatchObject({ source: 'rule', programId: 9, dateTo: '2026-12-31', dateFrom: null, pricelistIds: [9], usedCount: 3 });
    expect(def.rewards[0]).toMatchObject({ mode: 'per_order', discount: 500, unsupported: false });
  });

  it('merges Odoo computed products with explicit ones and keeps the category', () => {
    const def = toDefinition('X', program, [rule({ valid_product_ids: [5], product_ids: [5, 6], product_category_id: [11, 'YK-PCR'] })], [reward], null, 1);
    expect(def.rules[0]).toMatchObject({ productIds: [5, 6], categoryId: 11, unsupported: false });
  });

  it('marks a tag or custom domain filter as unsupported when Odoo gives no computed products', () => {
    expect(toDefinition('X', program, [rule({ product_tag_id: [1, 'Promo'] })], [reward], null, 1).rules[0].unsupported).toBe(true);
    expect(toDefinition('X', program, [rule({ product_domain: "[('list_price', '>', 100)]" })], [reward], null, 1).rules[0].unsupported).toBe(true);
    expect(toDefinition('X', program, [rule({ product_domain: "[('list_price', '>', 100)]", valid_product_ids: [5] })], [reward], null, 1).rules[0].unsupported).toBe(false);
  });

  it('describes a coupon card', () => {
    const card = { id: 7, program_id: [9, 'x'] as [number, string], code: '044f', points: 1, expiration_date: false as const, partner_id: [900, 'ร้าน'] as [number, string], active: true };
    expect(toDefinition('044f', program, [], [reward], card, null)).toMatchObject({ source: 'card', card: { points: 1, partnerId: 900, expirationDate: null } });
  });
});

describe('buildProgramValues', () => {
  const base = {
    name: 'ลด 5%', kind: 'promo_code' as const, code: 'YEAREND5', discount: 5, mode: 'percent' as const, applicability: 'order' as const,
    categoryId: null, maxAmount: 1000, minimumAmount: 5000, minimumQty: 4, dateFrom: null, dateTo: '2026-12-31', maxUsage: 0,
  };

  it('builds a promo-code program with one code rule and one discount reward, replacing Odoo defaults', () => {
    const values = buildProgramValues(base);
    expect(values).toMatchObject({ program_type: 'promo_code', trigger: 'with_code', applies_on: 'current', date_from: false, date_to: '2026-12-31', limit_usage: false });
    expect(values.rule_ids).toEqual([[5, 0, 0], [0, 0, expect.objectContaining({ mode: 'with_code', code: 'YEAREND5', minimum_amount: 5000, minimum_qty: 4 })]]);
    expect(values.reward_ids).toEqual([[5, 0, 0], [0, 0, expect.objectContaining({ reward_type: 'discount', discount: 5, discount_mode: 'percent', discount_applicability: 'order', discount_max_amount: 1000, required_points: 1 })]]);
  });

  it('builds a coupon program without rules and limits usage when asked', () => {
    const values = buildProgramValues({ ...base, kind: 'coupons', code: null, maxUsage: 50 });
    expect(values).toMatchObject({ program_type: 'coupons', limit_usage: true, max_usage: 50, rule_ids: [[5, 0, 0]] });
  });

  it('sets the category only for a specific discount and drops the cap for a baht discount', () => {
    const reward = (patch: object) => (buildProgramValues({ ...base, ...patch }).reward_ids as unknown[][])[1][2];
    expect(reward({ applicability: 'specific', categoryId: 11 })).toMatchObject({ discount_product_category_id: 11 });
    expect(reward({ categoryId: 11 })).not.toHaveProperty('discount_product_category_id');
    expect(reward({ mode: 'per_order', discount: 500 })).toMatchObject({ discount_mode: 'per_order', discount_max_amount: 0 });
  });
});

describe('generateCoupons', () => {
  it('creates one 1-point card per coupon for the partner and returns the codes Odoo generated', async () => {
    vi.mocked(rpc.odooWrite).mockResolvedValueOnce([31, 32]);
    vi.mocked(rpc.odooSearchRead).mockResolvedValueOnce([{ code: 'a1' }, { code: 'b2' }]);
    await expect(generateCoupons(9, { count: 2, partnerId: 900, expirationDate: '2026-12-31' })).resolves.toEqual(['a1', 'b2']);
    expect(rpc.odooWrite).toHaveBeenCalledWith('loyalty.card', 'create', [[
      { program_id: 9, points: 1, partner_id: 900, expiration_date: '2026-12-31' },
      { program_id: 9, points: 1, partner_id: 900, expiration_date: '2026-12-31' },
    ]]);
  });
});
