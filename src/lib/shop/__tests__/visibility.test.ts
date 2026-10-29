import { describe, expect, it } from 'vitest';
import { groupRestricts, isProductVisible } from '../visibility';

const yk = { tmplId: 1, brand: 'YK', categoryId: 11, dealerType: 'CAR' as const };
const mi = { tmplId: 2, brand: 'MI', categoryId: 12, dealerType: 'CAR' as const };
const truck = { tmplId: 3, brand: 'YK', categoryId: 21, dealerType: 'TRUCK' as const };
const empty = { brands: [], categoryIds: [], includeTmplIds: [], excludeTmplIds: [] };

describe('isProductVisible', () => {
  it('without a group shows every product of the dealer families only', () => {
    expect(isProductVisible(yk, { types: ['CAR'], group: null })).toBe(true);
    expect(isProductVisible(truck, { types: ['CAR'], group: null })).toBe(false);
  });

  it('an empty group behaves like no group, except for excluded products', () => {
    expect(groupRestricts(empty)).toBe(false);
    expect(isProductVisible(mi, { types: ['CAR'], group: empty })).toBe(true);
    expect(isProductVisible(mi, { types: ['CAR'], group: { ...empty, excludeTmplIds: [2] } })).toBe(false);
  });

  it('brands, categories and the include list each grant access', () => {
    const group = { ...empty, brands: ['YK'] };
    expect(isProductVisible(yk, { types: ['CAR'], group })).toBe(true);
    expect(isProductVisible(mi, { types: ['CAR'], group })).toBe(false);
    expect(isProductVisible(mi, { types: ['CAR'], group: { ...empty, categoryIds: [12] } })).toBe(true);
    expect(isProductVisible(mi, { types: ['CAR'], group: { ...group, includeTmplIds: [2] } })).toBe(true);
  });

  it('never shows a product outside the dealer families, even when the group includes it', () => {
    expect(isProductVisible(truck, { types: ['CAR'], group: { ...empty, brands: ['YK'], includeTmplIds: [3] } })).toBe(false);
  });

  it('exclude wins over include', () => {
    expect(isProductVisible(yk, { types: ['CAR'], group: { ...empty, includeTmplIds: [1], excludeTmplIds: [1] } })).toBe(false);
  });
});
