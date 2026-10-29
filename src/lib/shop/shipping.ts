import { z } from 'zod';
import data from '@/data/thai-address.json';
import { findPostalCode, type ThaiAddressData } from '@/lib/thai-address';

const thaiAddressData = data as ThaiAddressData;

/** Strips spaces/dashes and turns +66 into a leading 0, e.g. `+66 81-234-5678` → `0812345678`. */
export function normalizeThaiPhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, '');
  return digits.startsWith('+66') ? `0${digits.slice(3)}` : digits;
}

/**
 * Structured Thai delivery address; province/district/subdistrict must be a real combination.
 * The postal code defaults from the subdistrict but may be edited (some areas share several codes).
 */
export const thaiAddressSchema = z.object({
  line: z.string().trim().min(3, 'กรอกบ้านเลขที่ / ถนน').max(200, 'บ้านเลขที่ / ถนน ยาวเกิน 200 ตัวอักษร'),
  province: z.string().trim().min(1, 'เลือกจังหวัด'),
  district: z.string().trim().min(1, 'เลือกอำเภอ/เขต'),
  subdistrict: z.string().trim().min(1, 'เลือกตำบล/แขวง'),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก'),
}).refine((a) => findPostalCode(thaiAddressData, a.province, a.district, a.subdistrict) !== null, { message: 'จังหวัด / อำเภอ / ตำบล ไม่ตรงกัน', path: ['subdistrict'] });

/** Shipping details a dealer may edit themselves: structured delivery address and contact phone. */
export const shippingSchema = z.object({
  address: thaiAddressSchema,
  phone: z.string().trim().max(30).transform(normalizeThaiPhone)
    .refine((v) => v === '' || /^0\d{8,9}$/.test(v), 'เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)'),
});

export type ShippingInput = z.infer<typeof shippingSchema>;

/** Reads the address fields posted by `<ThaiAddressFields>` (names `line`, `province`, …). */
export function addressFromForm(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? '');
  return { line: get('line'), province: get('province'), district: get('district'), subdistrict: get('subdistrict'), postalCode: get('postalCode') };
}
