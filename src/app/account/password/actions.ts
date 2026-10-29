'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { passwordProblem, verifyPassword } from '@/lib/auth/password';
import { requireUser } from '@/lib/auth/session';
import { setPassword } from '@/lib/auth/users';
import { safeNext } from '@/lib/safe-next';
import { homeFor, type Role } from '@/lib/auth/roles';

export type PasswordResult = { ok: false; message: string } | null;

/** Lets any signed-in user change their own password. */
export async function changePasswordAction(_prev: PasswordResult, formData: FormData): Promise<PasswordResult> {
  const user = await requireUser();
  const parsed = z.object({ current: z.string().optional().default(''), password: z.string(), confirm: z.string(), next: z.string().optional() })
    .safeParse({ current: formData.get('current') ?? undefined, password: formData.get('password'), confirm: formData.get('confirm'), next: formData.get('next') ?? undefined });
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ครบ' };
  if (!user.mustChangePassword && !verifyPassword(parsed.data.current, user.passwordHash)) return { ok: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { ok: false, message: problem };
  if (parsed.data.password !== parsed.data.confirm) return { ok: false, message: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน' };
  await setPassword(user.id, parsed.data.password, false);
  await audit(user.id, 'password.change', 'User', user.id);
  redirect(safeNext(parsed.data.next, homeFor(user.role as Role)));
}
