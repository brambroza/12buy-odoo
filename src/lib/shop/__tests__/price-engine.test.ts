import { describe, expect, it } from 'vitest';
import { computePrice, fromOdooItem, type PriceContext, type PricelistItem } from '../price-engine';

const item = (overrides: Partial<PricelistItem>): PricelistItem => ({
  id: 1, pricelistId: 1, appliedOn: '3_global', productTmplId: null, productId: null, categId: null,
  minQuantity: 0, computePrice: 'fixed', fixedPrice: 0, percentPrice: 0, priceDiscount: 0, priceSurcharge: 0,
  priceRound: 0, priceMinMargin: 0, priceMaxMargin: 0, base: 'list_price', basePricelistId: null, dateStart: null, dateEnd: null,
  ...overrides,
});

const subject = { productId: 981, tmplId: 979, categoryId: 24, listPrice: 6200 };

function ctx(items: PricelistItem[], parents: [number, number | null][] = [[24, null]]): PriceContext {
  const map = new Map<number, PricelistItem[]>();
  for (const it of items) map.set(it.pricelistId, [...(map.get(it.pricelistId) ?? []), it]);
  return { itemsByPricelist: map, categoryParents: new Map(parents), now: new Date('2026-10-16') };
}

describe('computePrice', () => {
  it('falls back to list price when no rule', () => {
    expect(computePrice(subject, 1, 1, ctx([]))).toBe(6200);
  });

  it('applies fixed price per product template', () => {
    const c = ctx([item({ id: 40, pricelistId: 8, appliedOn: '1_product', productTmplId: 979, fixedPrice: 5400 })]);
    expect(computePrice(subject, 8, 1, c)).toBe(5400);
  });

  it('applies percentage on category based on another pricelist', () => {
    const c = ctx([
      item({ id: 1, pricelistId: 2, appliedOn: '2_product_category', categId: 24, computePrice: 'percentage', percentPrice: 4, base: 'pricelist', basePricelistId: 1 }),
    ]);
    expect(computePrice(subject, 2, 1, c)).toBe(5952);
  });

  it('chains to the base pricelist fixed rule', () => {
    const c = ctx([
      item({ id: 40, pricelistId: 8, appliedOn: '1_product', productTmplId: 979, fixedPrice: 5400 }),
      item({ id: 50, pricelistId: 9, appliedOn: '3_global', computePrice: 'percentage', percentPrice: 10, base: 'pricelist', basePricelistId: 8 }),
    ]);
    expect(computePrice(subject, 9, 1, c)).toBe(4860);
  });

  it('prefers product rule over category rule (Odoo priority)', () => {
    const c = ctx([
      item({ id: 2, pricelistId: 3, appliedOn: '2_product_category', categId: 24, fixedPrice: 1000 }),
      item({ id: 1, pricelistId: 3, appliedOn: '1_product', productTmplId: 979, fixedPrice: 5000 }),
    ]);
    expect(computePrice(subject, 3, 1, c)).toBe(5000);
  });

  it('respects min quantity and picks the highest satisfied tier', () => {
    const c = ctx([
      item({ id: 1, pricelistId: 3, appliedOn: '1_product', productTmplId: 979, fixedPrice: 5000, minQuantity: 0 }),
      item({ id: 2, pricelistId: 3, appliedOn: '1_product', productTmplId: 979, fixedPrice: 4800, minQuantity: 10 }),
    ]);
    expect(computePrice(subject, 3, 4, c)).toBe(5000);
    expect(computePrice(subject, 3, 10, c)).toBe(4800);
  });

  it('matches parent category rules', () => {
    const c = ctx([item({ id: 1, pricelistId: 3, appliedOn: '2_product_category', categId: 100, fixedPrice: 4444 })], [[24, 100], [100, null]]);
    expect(computePrice(subject, 3, 1, c)).toBe(4444);
  });

  it('applies formula discount, rounding and surcharge', () => {
    const c = ctx([item({ id: 1, pricelistId: 3, computePrice: 'formula', priceDiscount: 10, priceRound: 10, priceSurcharge: 5 })]);
    expect(computePrice(subject, 3, 1, c)).toBe(5585);
  });

  it('ignores expired rules', () => {
    const c = ctx([item({ id: 1, pricelistId: 3, fixedPrice: 1, dateEnd: '2026-01-01' })]);
    expect(computePrice(subject, 3, 1, c)).toBe(6200);
  });

  it('maps raw Odoo records', () => {
    const mapped = fromOdooItem({ id: 7, pricelist_id: [8, 'x'], applied_on: '1_product', product_tmpl_id: [979, 'y'], product_id: false, categ_id: false, min_quantity: 0, compute_price: 'fixed', fixed_price: 5400, percent_price: 0, base: 'list_price', base_pricelist_id: false, date_start: false, date_end: false });
    expect(mapped.pricelistId).toBe(8);
    expect(mapped.productTmplId).toBe(979);
    expect(mapped.productId).toBeNull();
    expect(mapped.dateStart).toBeNull();
  });
});
