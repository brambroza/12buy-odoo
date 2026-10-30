'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { allowResetRequest, requestPasswordReset } from '@/lib/auth/reset-requests';
import { clientIp } from '@/lib/security/rate-limit';
import { flash } from '@/lib/flash';

export type ForgotPasswordResult = { ok: true; message: string } | { ok: false; message: string } | null;

const schema = z.object({
  email: z.string().trim().email('อีเมลไม่ถูกต้อง').max(200),
  contact: z.string().trim().max(60, 'ช่องทางติดต่อยาวเกินไป').transform((v) => v || null),
});

/** Same message whether or not the email exists, so the form cannot be used to probe accounts. */
const DONE = 'รับคำขอแล้ว หากอีเมลนี้มีบัญชีในระบบ ทีมงานจะส่งรหัสผ่านชั่วคราวให้ทาง LINE หรือโทรภายใน 1 วันทำการ';

/** Public "forgot password" form: validate, rate-limit by IP, record the request for an admin to handle. */
export async function forgotPasswordAction(_prev: ForgotPasswordResult, formData: FormData): Promise<ForgotPasswordResult> {
  const parsed = schema.safeParse({ email: formData.get('email') ?? '', contact: formData.get('contact') ?? '' });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };

  const ip = clientIp(await headers());
  if (!(await allowResetRequest(ip))) return { ok: false, message: 'ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง หรือทัก LINE ได้เลย' };

  try {
    await requestPasswordReset({ email: parsed.data.email, contact: parsed.data.contact, ip: ip.slice(0, 64) });
  } catch (error) {
    console.error('[password-reset] save failed', error instanceof Error ? error.message : error);
    return { ok: false, message: 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่ หรือทัก LINE ได้เลย' };
  }
  await flash('ส่งคำขอรีเซ็ตรหัสผ่านแล้ว', { icon: 'mail', description: 'ทีมงานจะติดต่อกลับภายใน 1 วันทำการ' });
  return { ok: true, message: DONE };
}
