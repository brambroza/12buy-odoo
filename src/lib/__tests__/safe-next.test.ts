import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/shop/search?q=195')).toBe('/shop/search?q=195');
  });
  it('rejects external, protocol-relative and malformed targets', () => {
    expect(safeNext('https://evil.test')).toBe('/shop');
    expect(safeNext('//evil.test')).toBe('/shop');
    expect(safeNext('/\\evil.test')).toBe('/shop');
    expect(safeNext('/a\nLocation: x')).toBe('/shop');
    expect(safeNext(null)).toBe('/shop');
    expect(safeNext('', '/tires')).toBe('/tires');
  });
});
