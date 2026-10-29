import { describe, expect, it } from 'vitest';
import { normalizeThaiPhone, shippingSchema, thaiAddressSchema } from '@/lib/shop/shipping';

const bkk = { line: '99 ถ.สุขุมวิท', province: 'กรุงเทพมหานคร', district: 'คลองเตย', subdistrict: 'คลองเตย', postalCode: '10110' };

describe('normalizeThaiPhone', () => {
  it('strips separators and converts +66', () => {
    expect(normalizeThaiPhone('081-234-5678')).toBe('0812345678');
    expect(normalizeThaiPhone('+66 81 234 5678')).toBe('0812345678');
    expect(normalizeThaiPhone('(02) 123-4567')).toBe('021234567');
  });
});

describe('thaiAddressSchema', () => {
  it('accepts a real province/district/subdistrict combination', () => {
    expect(thaiAddressSchema.parse({ ...bkk, line: '  99 ถ.สุขุมวิท ' }).line).toBe('99 ถ.สุขุมวิท');
  });

  it('accepts an edited postal code as long as it has 5 digits', () => {
    expect(thaiAddressSchema.safeParse({ ...bkk, postalCode: '10111' }).success).toBe(true);
    expect(thaiAddressSchema.safeParse({ ...bkk, postalCode: '1011' }).success).toBe(false);
  });

  it('rejects mismatched or missing levels', () => {
    expect(thaiAddressSchema.safeParse({ ...bkk, district: 'บางรัก' }).success).toBe(false);
    expect(thaiAddressSchema.safeParse({ ...bkk, subdistrict: '' }).success).toBe(false);
    expect(thaiAddressSchema.safeParse({ ...bkk, line: 'ab' }).success).toBe(false);
  });
});

describe('shippingSchema', () => {
  it('normalizes phone and allows it empty', () => {
    expect(shippingSchema.parse({ address: bkk, phone: '081-234-5678' }).phone).toBe('0812345678');
    expect(shippingSchema.parse({ address: bkk, phone: '' }).phone).toBe('');
  });

  it('rejects bad phone numbers', () => {
    expect(shippingSchema.safeParse({ address: bkk, phone: '12345' }).success).toBe(false);
    expect(shippingSchema.safeParse({ address: bkk, phone: '0812abc678' }).success).toBe(false);
  });
});
