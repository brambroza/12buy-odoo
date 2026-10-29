import { describe, expect, it } from 'vitest';
import type { Catalog } from '@/lib/shop/catalog';
import { listBrands, parseDealerType, publicSearch, stockLevel, toPublicProduct } from '@/lib/shop/public-catalog';
import { parseSize } from '@/lib/shop/size';
import type { CatalogProduct } from '@/lib/shop/types';

function product(id: number, name: string, brand: string, dealerType: CatalogProduct['dealerType'], qty = 10): CatalogProduct {
  return { id, tmplId: id, name, code: `C${id}`, listPrice: 1234, categoryId: 1, categoryName: `${brand}-PCR`, brand, dealerType, size: parseSize(name), qtyAvailable: qty, imageUrl: null, baseUnit: 'เส้น', units: [{ id: 1, name: 'เส้น', factor: 1 }], vatRate: 7, vatIncluded: true };
}

const catalog: Catalog = {
  products: [
    product(1, 'YOKOHAMA 195/65R15 BluEarth', 'YK', 'CAR', 12),
    product(2, 'MICHELIN 195/65R15 Primacy', 'MI', 'CAR', 3),
    product(3, 'IRC 90/90-17 NR77', 'IRC', 'MOTORCYCLE', 0),
    product(4, 'GS MFX-60L', 'GS', 'BATTERY', 50),
  ],
  pricelists: [],
  priceCtx: { itemsByPricelist: new Map(), categoryParents: new Map() },
  loadedAt: new Date(),
};

describe('toPublicProduct', () => {
  it('never leaks price or quantity fields', () => {
    const pub = toPublicProduct(catalog.products[0]) as Record<string, unknown>;
    const keys = Object.keys(pub);
    expect(keys).toEqual(['id', 'name', 'brand', 'brandName', 'dealerType', 'typeLabel', 'size', 'imageUrl', 'stock']);
    expect(pub.brandName).toBe('Yokohama');
    expect(keys.some((k) => /price|qty|list|pricelist|categ|tmpl|code/i.test(k))).toBe(false);
    expect(JSON.stringify(pub)).not.toContain('1234');
  });

  it('buckets stock into three public levels', () => {
    expect(stockLevel(12)).toBe('IN_STOCK');
    expect(stockLevel(3)).toBe('LOW');
    expect(stockLevel(0)).toBe('BACKORDER');
  });
});

describe('publicSearch', () => {
  it('searches every family by size digits and sorts by brand', () => {
    const hits = publicSearch(catalog, { query: '1956515' });
    expect(hits.map((h) => h.brand)).toEqual(['MI', 'YK']);
  });

  it('filters by type and brand', () => {
    expect(publicSearch(catalog, { type: 'MOTORCYCLE' }).map((h) => h.id)).toEqual([3]);
    expect(publicSearch(catalog, { brand: 'gs' }).map((h) => h.id)).toEqual([4]);
  });
});

describe('listBrands / parseDealerType', () => {
  it('counts products per brand, optionally per type', () => {
    expect(listBrands(catalog).map((b) => b.brand)).toEqual(['GS', 'IRC', 'MI', 'YK']);
    expect(listBrands(catalog, 'CAR')).toEqual([{ brand: 'MI', name: 'MI', count: 1 }, { brand: 'YK', name: 'Yokohama', count: 1 }]);
  });

  it('accepts only known dealer types', () => {
    expect(parseDealerType('CAR')).toBe('CAR');
    expect(parseDealerType('nope')).toBeUndefined();
    expect(parseDealerType(undefined)).toBeUndefined();
  });
});
