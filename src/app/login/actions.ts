'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { verifyPassword } from '@/lib/auth/password';
import { homeFor, type Role } from '@/lib/auth/roles';
import { createSession, destroySession } from '@/lib/auth/session';
import { findUserByEmail, updateUser } from '@/lib/auth/users';
import { safeNext } from '@/lib/safe-next';

export type LoginResult = { ok: false; message: string } | null;

const schema = z.object({
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรอกรหัสผ่าน'),
  next: z.string().optional(),
  remember: z.boolean(),
});

const GENERIC = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';

/** Email + password sign-in for dealers and staff. Redirects on success. */
export async function loginAction(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  const parsed = schema.safeParse({ email: formData.get('email'), password: formData.get('password'), next: formData.get('next') ?? undefined, remember: formData.get('remember') === 'on' });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    await audit(user?.id ?? null, 'login.failed', 'User', user?.id ?? parsed.data.email.toLowerCase());
    return { ok: false, message: GENERIC };
  }
  if (!user.isActive) return { ok: false, message: 'บัญชีนี้ถูกปิดการใช้งาน ติดต่อแอดมิน' };
  if (user.dealer && user.dealer.status !== 'ACTIVE' && (user.role === 'DEALER_OWNER' || user.role === 'DEALER_STAFF')) {
    return { ok: false, message: user.dealer.status === 'PENDING' ? 'ร้านของคุณรออนุมัติ ทีมงานจะติดต่อกลับภายใน 1 วันทำการ' : 'ร้านของคุณถูกระงับ ติดต่อฝ่ายขาย' };
  }

  await createSession(user.id, { remember: parsed.data.remember });
  await updateUser(user.id, { lastLoginAt: new Date() });
  await audit(user.id, 'login', 'User', user.id);

  if (user.mustChangePassword) redirect(`/account/password?next=${encodeURIComponent(safeNext(parsed.data.next, homeFor(user.role as Role)))}`);
  redirect(safeNext(parsed.data.next, homeFor(user.role as Role)));
}

/** Signs out and returns to the landing page. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/');
}
