import { describe, expect, it } from 'vitest';
import { canonicalCategory, familyCodeOf } from '../category';

describe('canonicalCategory', () => {
  it('keeps the flat BRAND-FAMILY layout', () => {
    expect(canonicalCategory('YK-PCR')).toBe('YK-PCR');
    expect(canonicalCategory('All / Saleable / YK-PCR')).toBe('YK-PCR');
  });

  it('turns nested family / brand categories into the flat layout', () => {
    expect(canonicalCategory('PCR / YK')).toBe('YK-PCR');
    expect(canonicalCategory('TBR / AN')).toBe('AN-TBR');
    expect(canonicalCategory('Battery / CM')).toBe('CM-BT');
    expect(canonicalCategory('Wheel / TM')).toBe('TM-WH');
    expect(canonicalCategory('All / PCR / YK')).toBe('YK-PCR');
  });

  it('returns the leaf alone when no family parent is known', () => {
    expect(canonicalCategory('OIL / PTT')).toBe('PTT');
    expect(canonicalCategory('PCR')).toBe('PCR');
    expect(canonicalCategory('Food')).toBe('Food');
    expect(canonicalCategory('')).toBe('');
    expect(canonicalCategory(' / ')).toBe('');
  });
});

describe('familyCodeOf', () => {
  it('maps parent names case-insensitively', () => {
    expect(familyCodeOf('battery')).toBe('BT');
    expect(familyCodeOf(' Wheel ')).toBe('WH');
    expect(familyCodeOf('OIL')).toBeUndefined();
  });
});
