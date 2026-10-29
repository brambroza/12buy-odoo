import { describe, expect, it } from 'vitest';
import { classifyCategory, defaultQty, priceFor, searchProducts, type Catalog } from '../catalog';
import { parseSize } from '../size';
import type { CatalogProduct } from '../types';

const product = (id: number, name: string, categoryName: string, listPrice: number): CatalogProduct => {
  const c = classifyCategory(categoryName)!;
  return { id, tmplId: id, name, code: `C${id}`, listPrice, categoryId: 1, categoryName, brand: c.brand, dealerType: c.dealerType, size: parseSize(name), qtyAvailable: 10, imageUrl: null, baseUnit: 'เส้น', units: [{ id: 1, name: 'เส้น', factor: 1 }], vatRate: 7, vatIncluded: true };
};

const catalog: Catalog = {
  products: [
    product(1, 'ยาง 195/65R15 AL30', 'YK-PCR', 2550),
    product(2, 'ยาง 195/65R15 COMFORT II', 'LT-PCR', 2300),
    product(3, 'Aonaite 11R22.5 16PR 668', 'AN-TBR', 6200),
    product(4, 'ยาง 80/90-17 4PR H-502 TT', 'AS-MC', 400),
    product(5, 'แบตเตอรี่ GS Extra 120L', 'GS-BT', 3000),
  ],
  pricelists: [],
  priceCtx: { itemsByPricelist: new Map(), categoryParents: new Map() },
  loadedAt: new Date(),
};

describe('classifyCategory', () => {
  it('maps Odoo category suffixes to dealer types', () => {
    expect(classifyCategory('YK-PCR')).toEqual({ brand: 'YK', dealerType: 'CAR' });
    expect(classifyCategory('AN-TBR')).toEqual({ brand: 'AN', dealerType: 'TRUCK' });
    expect(classifyCategory('IRC-MC')).toEqual({ brand: 'IRC', dealerType: 'MOTORCYCLE' });
    expect(classifyCategory('GS-BT')).toEqual({ brand: 'GS', dealerType: 'BATTERY' });
    expect(classifyCategory('TM-WH')).toEqual({ brand: 'TM', dealerType: 'WHEEL' });
    expect(classifyCategory('Deliveries')).toBeNull();
    expect(classifyCategory('Food')).toBeNull();
  });
});

describe('searchProducts', () => {
  it('restricts to the dealer types', () => {
    expect(searchProducts(catalog, { types: ['CAR'] }).map((p) => p.id)).toEqual([1, 2]);
    expect(searchProducts(catalog, { types: ['CAR', 'TRUCK'], type: 'TRUCK' }).map((p) => p.id)).toEqual([3]);
  });

  it('matches size queries in several spellings', () => {
    for (const q of ['195/65R15', '1956515', '195 65 15']) {
      expect(searchProducts(catalog, { query: q, types: ['CAR', 'TRUCK', 'MOTORCYCLE'] }).map((p) => p.id)).toEqual([1, 2]);
    }
    expect(searchProducts(catalog, { query: '8090-17', types: ['MOTORCYCLE'] }).map((p) => p.id)).toEqual([4]);
  });

  it('does not leak other types even when the size matches', () => {
    expect(searchProducts(catalog, { query: '11R22.5', types: ['CAR'] })).toEqual([]);
  });

  it('matches free text against name and brand', () => {
    expect(searchProducts(catalog, { query: 'comfort', types: ['CAR'] }).map((p) => p.id)).toEqual([2]);
    expect(searchProducts(catalog, { query: 'AN', types: ['TRUCK'] }).map((p) => p.id)).toEqual([3]);
  });

  it('filters by brand', () => {
    expect(searchProducts(catalog, { types: ['CAR'], brand: 'lt' }).map((p) => p.id)).toEqual([2]);
  });
});

describe('helpers', () => {
  it('falls back to list price without rules', () => {
    expect(priceFor(catalog, catalog.products[0], 99)).toBe(2550);
  });
  it('suggests sensible default quantities', () => {
    expect(defaultQty('CAR')).toBe(4);
    expect(defaultQty('TRUCK')).toBe(2);
    expect(defaultQty('BATTERY')).toBe(1);
  });
});
