import { z } from 'zod';
import { normalizeThaiPhone } from '@/lib/shop/shipping';

/** Thai mobile/landline: 9-10 digits, optional dashes or spaces (same rule as the dealer sign-up form). */
const PHONE_RE = /^0\d{1,2}[- ]?\d{3}[- ]?\d{3,4}$/;

/** Name + optional phone typed on a staff profile; blank phone becomes null. */
export const profileSchema = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อ').max(80, 'ชื่อยาวเกินไป'),
  phone: z.string().trim().transform((v, ctx) => {
    if (!v) return null;
    if (!PHONE_RE.test(v)) {
      ctx.addIssue({ code: 'custom', message: 'เบอร์โทรไม่ถูกต้อง' });
      return z.NEVER;
    }
    return normalizeThaiPhone(v);
  }),
});

/** Reads `name` and `phone` from a form. */
export function parseProfileForm(formData: FormData) {
  return profileSchema.safeParse({ name: formData.get('name') ?? '', phone: formData.get('phone') ?? '' });
}

