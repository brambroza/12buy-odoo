import { describe, expect, it } from 'vitest';
import { baseUnitLabel, buildUnitIndex, describeQty, parseQuickQty, pickUnit, unitsForProduct, type RawUom } from '@/lib/shop/units';

const rows: RawUom[] = [
  { id: 1, name: 'Units', relative_factor: 1, relative_uom_id: false },
  { id: 32, name: 'มัด 3 เส้น', relative_factor: 3, relative_uom_id: [1, 'Units'] },
  { id: 33, name: 'มัด 5 เส้น', relative_factor: 5, relative_uom_id: [1, 'Units'] },
  { id: 40, name: 'ลัง 2 มัด', relative_factor: 2, relative_uom_id: [33, 'มัด 5 เส้น'] },
];

describe('units', () => {
  const index = buildUnitIndex(rows);

  it('resolves factors through the relative chain', () => {
    expect(index.get(32)?.factor).toBe(3);
    expect(index.get(40)?.factor).toBe(10);
    expect(index.get(1)?.factor).toBe(1);
  });

  it('lists base unit first then packs ascending', () => {
    const units = unitsForProduct('MOTORCYCLE', 1, [33, 32, 999], index);
    expect(units.map((u) => `${u.name}:${u.factor}`)).toEqual(['เส้น:1', 'มัด 3 เส้น:3', 'มัด 5 เส้น:5']);
    expect(unitsForProduct('BATTERY', 1, [], index)).toEqual([{ id: 1, name: 'ลูก', factor: 1 }]);
    expect(baseUnitLabel('WHEEL')).toBe('วง');
  });

  it('picks a unit by id with base fallback', () => {
    const units = unitsForProduct('CAR', 1, [32], index);
    expect(pickUnit(units, 32).factor).toBe(3);
    expect(pickUnit(units, 777).factor).toBe(1);
    expect(pickUnit(units, null).name).toBe('เส้น');
  });

  it('describes quantities', () => {
    expect(describeQty(4, 'เส้น')).toBe('4 เส้น');
    expect(describeQty(6, 'เส้น', { name: 'มัด 3 เส้น', factor: 3 }, 2)).toBe('2 มัด 3 เส้น (6 เส้น)');
  });

  it('parses quick-order quantities', () => {
    expect(parseQuickQty('4')).toEqual({ qty: 4, pack: null });
    expect(parseQuickQty('x4')).toEqual({ qty: 4, pack: null });
    expect(parseQuickQty('2มัด')).toEqual({ qty: 2, pack: 'any' });
    expect(parseQuickQty('2 มัด 5')).toEqual({ qty: 2, pack: 5 });
    expect(parseQuickQty('2มัด5')).toEqual({ qty: 2, pack: 5 });
    expect(parseQuickQty('abc')).toBeNull();
  });
});
