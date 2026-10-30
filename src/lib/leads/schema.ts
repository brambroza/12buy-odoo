import { z } from 'zod';
import { passwordProblem } from '@/lib/auth/password';
import { PROVINCES } from '@/lib/provinces';
import { addressFromForm, normalizeThaiPhone, thaiAddressSchema } from '@/lib/shop/shipping';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { normalizeTaxId, taxIdProblem } from '@/lib/tax-id';

const DEALER_TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

/** Thai mobile/landline: 9-10 digits, optional dashes or spaces. */
const PHONE_RE = /^0\d{1,2}[- ]?\d{3}[- ]?\d{3,4}$/;

/**
 * Validation for the public "สมัครเป็นดีลเลอร์" form: shop, tax id, full Thai address, contact,
 * product families and the owner's login (email + password typed twice).
 */
export const dealerLeadSchema = z.object({
  shopName: z.string().trim().min(2, 'กรุณากรอกชื่อร้าน').max(120, 'ชื่อร้านยาวเกินไป'),
  /** 13 digits (checksum verified); the duplicate key for dealers and Odoo customers. */
  taxId: z.string().transform((v, ctx) => {
    const problem = taxIdProblem(v);
    if (problem) {
      ctx.addIssue({ code: 'custom', message: problem });
      return z.NEVER;
    }
    return normalizeTaxId(v) as string;
  }),
  address: thaiAddressSchema.refine((a) => (PROVINCES as readonly string[]).includes(a.province), { message: 'กรุณาเลือกจังหวัด', path: ['province'] }),
  types: z.array(z.enum(DEALER_TYPES as [DealerType, ...DealerType[]])).min(1, 'เลือกหมวดสินค้าอย่างน้อย 1 หมวด'),
  phone: z.string().trim().regex(PHONE_RE, 'เบอร์โทรไม่ถูกต้อง').transform(normalizeThaiPhone),
  lineId: z.string().trim().max(60, 'LINE ID ยาวเกินไป').optional().or(z.literal('')),
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').max(254, 'อีเมลยาวเกินไป'),
  password: z.string().superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  }),
  confirmPassword: z.string(),
  /** Honeypot: real users never fill this. */
  website: z.literal('').optional(),
}).refine((v) => v.password === v.confirmPassword, { message: 'ยืนยันรหัสผ่านไม่ตรงกัน', path: ['confirmPassword'] });

export type DealerLeadInput = z.infer<typeof dealerLeadSchema>;

/** Converts a FormData payload into the shape `dealerLeadSchema` expects. */
export function leadFromFormData(formData: FormData): unknown {
  return {
    shopName: formData.get('shopName'),
    taxId: String(formData.get('taxId') ?? ''),
    address: addressFromForm(formData),
    types: formData.getAll('types'),
    phone: formData.get('phone'),
    lineId: formData.get('lineId') ?? '',
    email: formData.get('email'),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
    website: formData.get('website') ?? '',
  };
}
