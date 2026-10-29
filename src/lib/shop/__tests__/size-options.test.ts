import { describe, expect, it } from 'vitest';
import { parseSize } from '@/lib/shop/size';
import { buildSizeOptions, partValues, sizeQuery, splitSize } from '@/lib/shop/size-options';

import type { DealerType } from '@/lib/shop/types';

const TYPES: DealerType[] = ['CAR', 'CAR', 'CAR', 'TRUCK', 'MOTORCYCLE', 'CAR', 'BATTERY'];
const products = ['195/65R15', '195/60R15', '205/55R16', '11R22.5', '90/90-17', '33x12.50R20', 'แบตเตอรี่ 3K N100'].map((name, i) => ({
  size: parseSize(name),
  dealerType: TYPES[i],
}));

describe('splitSize', () => {
  it('splits car, truck, motorcycle and flotation sizes', () => {
    expect(splitSize('195/65R15')).toEqual({ width: '195', aspect: '65', rim: '15' });
    expect(splitSize('11R22.5')).toEqual({ width: '11', aspect: null, rim: '22.5' });
    expect(splitSize('90/90-17')).toEqual({ width: '90', aspect: '90', rim: '17' });
    expect(splitSize('215/70R15C')).toEqual({ width: '215', aspect: '70', rim: '15' });
    expect(splitSize('33x12.50R20')).toEqual({ width: '33', aspect: '12.50', rim: '20' });
    expect(splitSize('N100')).toBeNull();
  });
});

describe('buildSizeOptions / partValues', () => {
  const options = buildSizeOptions(products);

  it('dedupes, skips non-sizes and sorts numerically', () => {
    expect(options.map((o) => o.label)).toEqual(['11R22.5', '33x12.50R20', '90/90-17', '195/60R15', '195/65R15', '205/55R16']);
  });

  it('narrows widths by family and cascades aspect → rim', () => {
    expect(partValues(options, 'width', { type: 'CAR' })).toEqual(['33', '195', '205']);
    expect(partValues(options, 'aspect', { width: '195' })).toEqual(['60', '65']);
    expect(partValues(options, 'rim', { width: '195', aspect: '65' })).toEqual(['15']);
    expect(partValues(options, 'aspect', { width: '11' })).toEqual([null]);
  });

  it('builds exact label or digit prefix queries', () => {
    expect(sizeQuery({ width: '195', aspect: '65', rim: '15' }, options)).toBe('195/65R15');
    expect(sizeQuery({ width: '11', aspect: null, rim: '22.5' }, options)).toBe('11R22.5');
    expect(sizeQuery({ width: '195', aspect: '65' }, options)).toBe('19565');
    expect(sizeQuery({ width: '195' }, options)).toBe('195');
    expect(sizeQuery({}, options)).toBe('');
  });
});
