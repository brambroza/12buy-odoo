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

  it('reads an Odoo partner whose city is a bare "เมือง"', () => {
    expect(guessThaiAddress(d, '11/3 ถนนทุ่งศรีเมือง กาฬสินธุ์ เมือง จังหวัดกาฬสินธุ์ 46000', 'กาฬสินธุ์'))
      .toEqual({ line: '11/3 ถนนทุ่งศรีเมือง', subdistrict: 'กาฬสินธุ์', district: 'เมืองกาฬสินธุ์', province: 'กาฬสินธุ์', postalCode: '46000' });
  });

  it('does not read the อำเภอ name as a second ตำบล', () => {
    expect(guessThaiAddress(d, '33/3 หมู่ 3 พระขาว บางบาล จังหวัดพระนครศรีอยุธยา 13250'))
      .toEqual({ line: '33/3 หมู่ 3', subdistrict: 'พระขาว', district: 'บางบาล', province: 'พระนครศรีอยุธยา', postalCode: '13250' });
    expect(guessThaiAddress(d, 'เลขที่ 560/132 หมู่ที่ 3 ตำบลหนองขาม อำเภอศรีราชา 20110', 'ชลบุรี')?.subdistrict).toBe('หนองขาม');
  });

  it('prefers a ตำบล name that stands as its own word', () => {
    expect(guessThaiAddress(d, '185/3 หมู่ 1 ถนนบ้านนา-แก่งคอย ชะอม แก่งคอย จังหวัดสระบุรี 18110'))
      .toEqual({ line: '185/3 หมู่ 1 ถนนบ้านนา-แก่งคอย', subdistrict: 'ชะอม', district: 'แก่งคอย', province: 'สระบุรี', postalCode: '18110' });
    expect(guessThaiAddress(d, '99/3 หมู่ 3 ถนนสีคิ้ว-ชัยภูมิ สีคิ้ว สีคิ้ว จังหวัดนครราชสีมา 30140')?.line).toBe('99/3 หมู่ 3 ถนนสีคิ้ว-ชัยภูมิ');
  });

  it('keeps the zip from the text when it differs from the dataset', () => {
    expect(guessThaiAddress(d, '177 หมู่ที่ 7 บ้านโพธิ์ เมือง จังหวัดนครราชสีมา 30000'))
      .toEqual({ line: '177 หมู่ที่ 7', subdistrict: 'บ้านโพธิ์', district: 'เมืองนครราชสีมา', province: 'นครราชสีมา', postalCode: '30000' });
  });

  it('reads อำเภอ<province> as the เมือง district', () => {
    expect(guessThaiAddress(d, 'เลขที่ 97/1 หมู่ 3 ตำบลนาดี อำเภอสมุทรสาคร จังหวัดสมุทรสาคร 74000')?.district).toBe('เมืองสมุทรสาคร');
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
