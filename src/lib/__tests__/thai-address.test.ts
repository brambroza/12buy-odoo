import { describe, expect, it } from 'vitest';
import data from '@/data/thai-address.json';
import { findPostalCode, formatThaiAddress, guessThaiAddress, levelLabels, listDistricts, listProvinces, listSubdistricts, parseThaiAddress, type ThaiAddressData } from '@/lib/thai-address';

const d = data as ThaiAddressData;

describe('thai address data', () => {
  it('has all 77 provinces sorted in Thai order', () => {
    const provinces = listProvinces(d);
    expect(provinces).toHaveLength(77);
    expect(provinces[0]).toBe('กระบี่');
    expect(provinces).toContain('บึงกาฬ');
  });

  it('cascades province → district → subdistrict with postal codes', () => {
    expect(listDistricts(d, 'กรุงเทพมหานคร')).toHaveLength(50);
    expect(listDistricts(d, 'ไม่มีจังหวัดนี้')).toEqual([]);
    expect(listSubdistricts(d, 'เชียงใหม่', 'เมืองเชียงใหม่').map((s) => s.name)).toContain('ศรีภูมิ');
    expect(findPostalCode(d, 'เชียงใหม่', 'เมืองเชียงใหม่', 'ศรีภูมิ')).toBe('50200');
    expect(findPostalCode(d, 'เชียงใหม่', 'เมืองเชียงใหม่', 'คลองเตย')).toBeNull();
  });
});

describe('formatThaiAddress', () => {
  it('uses แขวง/เขต for Bangkok and ตำบล/อำเภอ/จังหวัด elsewhere', () => {
    expect(levelLabels('กรุงเทพมหานคร')).toEqual({ district: 'เขต', subdistrict: 'แขวง' });
    expect(formatThaiAddress({ line: '99 ถ.สุขุมวิท', subdistrict: 'คลองเตย', district: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110' }))
      .toBe('99 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110');
    expect(formatThaiAddress({ line: '1/2 ม.3', subdistrict: 'ศรีภูมิ', district: 'เมืองเชียงใหม่', province: 'เชียงใหม่', postalCode: '50200' }))
      .toBe('1/2 ม.3 ตำบลศรีภูมิ อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50200');
  });
});

describe('parseThaiAddress', () => {
  it('returns null for missing or malformed values', () => {
    expect(parseThaiAddress(null)).toBeNull();
    expect(parseThaiAddress({ line: 'x' })).toBeNull();
    expect(parseThaiAddress({ line: 'x', subdistrict: 'a', district: 'b', province: 'c', postalCode: '10000', extra: 1 })).toEqual({ line: 'x', subdistrict: 'a', district: 'b', province: 'c', postalCode: '10000' });
  });
});

describe('guessThaiAddress', () => {
  it('reads an Odoo-style street/street2/city/zip line', () => {
    expect(guessThaiAddress(d, '1/2 ม.3 ศรีภูมิ เมืองเชียงใหม่ เชียงใหม่ 50200'))
      .toEqual({ line: '1/2 ม.3', subdistrict: 'ศรีภูมิ', district: 'เมืองเชียงใหม่', province: 'เชียงใหม่', postalCode: '50200' });
  });

  it('strips ต./แขวง prefixes and understands อ.เมือง and กทม.', () => {
    expect(guessThaiAddress(d, '99 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กทม. 10110'))
      .toEqual({ line: '99 ถ.สุขุมวิท', subdistrict: 'คลองเตย', district: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110' });
    expect(guessThaiAddress(d, '12 ม.1 ต.ศรีภูมิ อ.เมือง จ.เชียงใหม่')?.district).toBe('เมืองเชียงใหม่');
  });

  it('round-trips the formatted address', () => {
    const address = { line: '55/7 ถ.มิตรภาพ', subdistrict: 'ในเมือง', district: 'เมืองนครราชสีมา', province: 'นครราชสีมา', postalCode: '30000' };
    expect(guessThaiAddress(d, formatThaiAddress(address))).toEqual(address);
  });

  it('returns null when the subdistrict or district is missing', () => {
    expect(guessThaiAddress(d, '')).toBeNull();
    expect(guessThaiAddress(d, '123 ถ.ตัวอย่าง')).toBeNull();
    expect(guessThaiAddress(d, '123 เชียงใหม่ 50200')).toBeNull();
  });
});
