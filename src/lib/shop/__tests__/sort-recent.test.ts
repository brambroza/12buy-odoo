import { describe, expect, it } from 'vitest';
import { parsePriceRange, parseSort, sortPriced } from '@/lib/shop/sort';
import { parseRecent, pushRecent, RECENT_MAX } from '@/lib/shop/recent';
import type { CatalogProduct } from '@/lib/shop/types';

const p = (id: number, brand: string, size: string, qty: number): CatalogProduct => ({ id, tmplId: id, name: `P${id}`, code: `C${id}`, listPrice: 0, categoryId: 1, categoryName: 'c', brand, dealerType: 'CAR', size: { label: size, digits: size.replace(/\D/g, ''), kind: 'CAR' } as never, qtyAvailable: qty, imageUrl: null, baseUnit: 'เส้น', units: [], vatRate: 7, vatIncluded: true });

describe('sortPriced', () => {
  const items = [
    { product: p(1, 'YOKOHAMA', '195/65R15', 2), price: 2000 },
    { product: p(2, 'BRIDGESTONE', '185/60R15', 9), price: 1500 },
    { product: p(3, 'MICHELIN', '195/65R15', 0), price: 2500 },
  ];
  it('orders by price, brand, size and stock', () => {
    expect(sortPriced(items, 'price').map((i) => i.product.id)).toEqual([2, 1, 3]);
    expect(sortPriced(items, 'price_desc').map((i) => i.product.id)).toEqual([3, 1, 2]);
    expect(sortPriced(items, 'brand').map((i) => i.product.id)).toEqual([2, 3, 1]);
    expect(sortPriced(items, 'size').map((i) => i.product.id)).toEqual([2, 1, 3]);
    expect(sortPriced(items, 'stock').map((i) => i.product.id)).toEqual([2, 1, 3]);
  });
  it('falls back to price for unknown sort keys and parses ranges', () => {
    expect(parseSort('nope')).toBe('price');
    expect(parseSort('stock')).toBe('stock');
    expect(parsePriceRange('1,000', '')).toEqual({ min: 1000, max: null });
    expect(parsePriceRange('abc', '-5')).toEqual({ min: null, max: null });
  });
});

describe('recently viewed cookie', () => {
  it('moves the newest id to the front and caps the list', () => {
    expect(pushRecent([2, 3], 3)).toEqual([3, 2]);
    expect(pushRecent([], 7)).toEqual([7]);
    const many = Array.from({ length: RECENT_MAX }, (_, i) => i + 1);
    expect(pushRecent(many, 99)).toHaveLength(RECENT_MAX);
    expect(pushRecent(many, 99)[0]).toBe(99);
  });
  it('ignores junk in the cookie', () => {
    expect(parseRecent('5,x,-1,0,7')).toEqual([5, 7]);
    expect(parseRecent(undefined)).toEqual([]);
  });
});
