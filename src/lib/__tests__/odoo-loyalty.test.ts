import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/odoo/rpc', () => ({ odooSearchRead: vi.fn(), odooRead: vi.fn(), odooWrite: vi.fn() }));
const { toDefinition } = await import('@/lib/odoo/loyalty');

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
