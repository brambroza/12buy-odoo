import { describe, expect, it } from 'vitest';
import { normalizeSizeQuery, parseSize, sizeMatches } from '../size';

describe('parseSize', () => {
  it.each([
    ['ยาง 195/65R15 AL30', '195/65R15', '15'],
    ['ยาง 205/55ZR16 AL30', '205/55ZR16', '16'],
    ['ยาง 215/70R15C MILE MAX', '215/70R15C', '15'],
    ['ยาง 70/90-14 SANDAH-Z NR89 TT', '70/90-14', '14'],
    ['ยาง 50/100-17 4PR H-969 TT', '50/100-17', '17'],
    ['Aonaite 11R22.5 16PR 668', '11R22.5', '22.5'],
    ['Aonaite 10.00R20 18PR 896', '10.00R20', '20'],
    ['9.5R17.5 18PR AAR-603', '9.5R17.5', '17.5'],
    ['ยาง 2.75-17 4PR H-621 TT', '2.75-17', '17'],
    ['ยาง 33x12.50R20 G016', '33x12.50R20', '20'],
  ])('parses "%s" → %s', (name, label, rim) => {
    const size = parseSize(name);
    expect(size?.label).toBe(label);
    expect(size?.rim).toBe(rim);
  });

  it('returns null for non-tire products', () => {
    expect(parseSize('แบตเตอรี่ 3K รุ่น N100 100Ah 512CCA')).toBeNull();
    expect(parseSize('Service Fee')).toBeNull();
  });
});

describe('normalizeSizeQuery + sizeMatches', () => {
  const size = parseSize('ยาง 195/65R15 AL30');

  it.each(['195/65R15', '195 65 15', '1956515', '195-65-15', '195/65/15', '19565', '195'])('matches "%s"', (query) => {
    const normalized = normalizeSizeQuery(query);
    expect(normalized).not.toBeNull();
    expect(sizeMatches(size, normalized!)).toBe(true);
  });

  it('does not match a different size', () => {
    expect(sizeMatches(size, normalizeSizeQuery('205/55R16')!)).toBe(false);
    expect(sizeMatches(size, normalizeSizeQuery('11R22.5')!)).toBe(false);
  });

  it('returns null for empty query', () => {
    expect(normalizeSizeQuery('   ')).toBeNull();
  });

  it('treats letters as label text search', () => {
    expect(normalizeSizeQuery('r15')).toEqual({ text: 'R15' });
    expect(sizeMatches(size, { text: 'R15' })).toBe(true);
  });
});
