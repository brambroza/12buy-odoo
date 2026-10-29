'use server';

import { flash } from '@/lib/flash';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { passwordProblem } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { countUsers, createUser } from '@/lib/auth/users';

export type SetupResult = { ok: false; message: string } | null;

const schema = z.object({
  name: z.string().trim().min(2, 'กรอกชื่อ').max(80),
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string(),
  confirm: z.string(),
});

/** One-time bootstrap: creates the first SUPER_ADMIN. Refuses once any user exists. */
export async function createFirstAdminAction(_prev: SetupResult, formData: FormData): Promise<SetupResult> {
  if ((await countUsers()) > 0) redirect('/login');
  const parsed = schema.safeParse({ name: formData.get('name'), email: formData.get('email'), password: formData.get('password'), confirm: formData.get('confirm') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { ok: false, message: problem };
  if (parsed.data.password !== parsed.data.confirm) return { ok: false, message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' };
  const user = await createUser({ email: parsed.data.email, name: parsed.data.name, password: parsed.data.password, role: 'SUPER_ADMIN' });
  await audit(user.id, 'setup.first-admin', 'User', user.id);
  await createSession(user.id);
  await flash('สร้างผู้ดูแลระบบคนแรกแล้ว', { icon: 'user', description: `${user.email} · เริ่มเพิ่มดีลเลอร์ได้เลย` });
  redirect('/admin/dealers');
}
