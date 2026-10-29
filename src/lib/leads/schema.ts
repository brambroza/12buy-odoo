import { z } from 'zod';
import { PROVINCES } from '@/lib/provinces';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';

const DEALER_TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

/** Thai mobile/landline: 9-10 digits, optional dashes or spaces. */
const PHONE_RE = /^0\d{1,2}[- ]?\d{3}[- ]?\d{3,4}$/;

/** Validation for the public "สมัครเป็นดีลเลอร์" form. */
export const dealerLeadSchema = z.object({
  shopName: z.string().trim().min(2, 'กรุณากรอกชื่อร้าน').max(120, 'ชื่อร้านยาวเกินไป'),
  province: z.enum(PROVINCES, { message: 'กรุณาเลือกจังหวัด' }),
  types: z.array(z.enum(DEALER_TYPES as [DealerType, ...DealerType[]])).min(1, 'เลือกหมวดสินค้าอย่างน้อย 1 หมวด'),
  phone: z.string().trim().regex(PHONE_RE, 'เบอร์โทรไม่ถูกต้อง'),
  lineId: z.string().trim().max(60, 'LINE ID ยาวเกินไป').optional().or(z.literal('')),
  /** Honeypot: real users never fill this. */
  website: z.literal('').optional(),
});

export type DealerLeadInput = z.infer<typeof dealerLeadSchema>;

/** Converts a FormData payload into the shape `dealerLeadSchema` expects. */
export function leadFromFormData(formData: FormData): unknown {
  return {
    shopName: formData.get('shopName'),
    province: formData.get('province'),
    types: formData.getAll('types'),
    phone: formData.get('phone'),
    lineId: formData.get('lineId') ?? '',
    website: formData.get('website') ?? '',
  };
}
