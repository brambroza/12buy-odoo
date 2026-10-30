import { describe, expect, it } from 'vitest';
import type { CatalogProduct } from '@/lib/shop/types';
import { cashDiscountProducts, formatCashDiscount, parseCashDiscount } from '../cash-discounts';

const base: CatalogProduct = { id: 1, tmplId: 10, name: 'ยาง 195/65R15', code: 'YK1', listPrice: 2550, categoryId: 1, categoryName: 'YK-PCR', brand: 'YK', dealerType: 'CAR', size: null, qtyAvailable: 5, imageUrl: null, baseUnit: 'เส้น', units: [{ id: 1, name: 'เส้น', factor: 1 }], vatRate: 7, vatIncluded: true };
const products: CatalogProduct[] = [
  base,
  { ...base, id: 2 }, // second variant of the same template
  { ...base, id: 3, tmplId: 20, name: 'ยางรถบรรทุก 11R22.5', code: 'TB1', brand: 'AB', dealerType: 'TRUCK' },
  { ...base, id: 4, tmplId: 30, name: 'แบตเตอรี่ 50B24', code: 'BT1', brand: 'GS', dealerType: 'BATTERY' },
];

describe('cashDiscountProducts', () => {
  it('lists one row per template, filtered by family, search and "only set"', () => {
    expect(cashDiscountProducts(products, {}, {}).map((p) => p.tmplId)).toEqual([30, 10, 20]);
    expect(cashDiscountProducts(products, {}, { type: 'TRUCK' }).map((p) => p.tmplId)).toEqual([20]);
    expect(cashDiscountProducts(products, {}, { q: 'gs' }).map((p) => p.tmplId)).toEqual([30]);
    expect(cashDiscountProducts(products, { '20': { kind: 'BAHT', value: 50 } }, { onlySet: true }).map((p) => p.tmplId)).toEqual([20]);
  });
});

describe('parseCashDiscount', () => {
  it('reads % and baht, blank or "none" as no discount', () => {
    expect(parseCashDiscount('PERCENT', '2.555')).toEqual({ kind: 'PERCENT', value: 2.56 });
    expect(parseCashDiscount('BAHT', '1,200')).toEqual({ kind: 'BAHT', value: 1200 });
    expect(parseCashDiscount('', '5')).toBeNull();
    expect(parseCashDiscount('PERCENT', ' ')).toBeNull();
  });
  it('rejects out-of-range values', () => {
    expect(parseCashDiscount('PERCENT', '60')).toEqual({ error: expect.any(String) });
    expect(parseCashDiscount('BAHT', '0')).toEqual({ error: expect.any(String) });
    expect(parseCashDiscount('BAHT', 'abc')).toEqual({ error: expect.any(String) });
  });
});

describe('formatCashDiscount', () => {
  it('shows % or baht per unit', () => {
    expect(formatCashDiscount({ kind: 'PERCENT', value: 2 })).toBe('2%');
    expect(formatCashDiscount({ kind: 'BAHT', value: 50 }, 'เส้น')).toBe('฿50.00 /เส้น');
  });
});
