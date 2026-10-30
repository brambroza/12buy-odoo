'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { AvatarResult } from '@/app/shop/actions';
import { audit } from '@/lib/auth/audit';
import { passwordProblem, verifyPassword } from '@/lib/auth/password';
import { parseProfileForm } from '@/lib/auth/profile';
import { requireBackoffice } from '@/lib/auth/session';
import { setPassword, updateUser } from '@/lib/auth/users';
import { deleteAvatar, saveAvatar } from '@/lib/shop/uploads';
import { flash } from '@/lib/flash';

export type ProfileResult = { ok: boolean; message: string } | null;

/** Signed-in staff edits their own name and phone. Email and role are changed by an admin only. */
export async function updateMyProfileAction(_prev: ProfileResult, formData: FormData): Promise<ProfileResult> {
  const user = await requireBackoffice();
  const parsed = parseProfileForm(formData);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  await updateUser(user.id, parsed.data);
  await audit(user.id, 'user.profile.update', 'User', user.id, { name: parsed.data.name, phone: parsed.data.phone });
  revalidatePath('/admin', 'layout');
  await flash('บันทึกโปรไฟล์แล้ว', { icon: 'user' });
  return { ok: true, message: 'บันทึกแล้ว' };
}

/** Uploads (or removes with `remove=1`) the signed-in staff member's profile picture. */
export async function updateMyAvatarAction(_prev: AvatarResult, formData: FormData): Promise<AvatarResult> {
  const user = await requireBackoffice();
  const previous = user.avatarFile;
  let avatarFile: string | null = null;
  if (formData.get('remove') !== '1') {
    const file = formData.get('avatar');
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'เลือกรูปก่อน' };
    const saved = await saveAvatar(user.id, file);
    if (!saved.ok) return { ok: false, message: saved.reason };
    avatarFile = saved.name;
  }
  await updateUser(user.id, { avatarFile });
  if (previous) await deleteAvatar(previous);
  await audit(user.id, avatarFile ? 'user.avatar.update' : 'user.avatar.remove', 'User', user.id);
  revalidatePath('/admin', 'layout');
  await flash(avatarFile ? 'อัปเดตรูปโปรไฟล์แล้ว' : 'ลบรูปโปรไฟล์แล้ว', { icon: 'image' });
  return { ok: true, message: avatarFile ? 'อัปเดตรูปโปรไฟล์แล้ว' : 'ลบรูปโปรไฟล์แล้ว' };
}

/** Changes the signed-in staff member's password after checking the current one; stays on the page. */
export async function changeMyPasswordAction(_prev: ProfileResult, formData: FormData): Promise<ProfileResult> {
  const user = await requireBackoffice();
  const parsed = z.object({ current: z.string(), password: z.string(), confirm: z.string() })
    .safeParse({ current: formData.get('current') ?? '', password: formData.get('password'), confirm: formData.get('confirm') });
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ครบ' };
  if (!verifyPassword(parsed.data.current, user.passwordHash)) return { ok: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { ok: false, message: problem };
  if (parsed.data.password !== parsed.data.confirm) return { ok: false, message: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน' };
  if (parsed.data.password === parsed.data.current) return { ok: false, message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม' };
  await setPassword(user.id, parsed.data.password, false);
  await audit(user.id, 'password.change', 'User', user.id);
  await flash('เปลี่ยนรหัสผ่านสำเร็จ', { icon: 'key', description: 'ครั้งหน้าเข้าสู่ระบบด้วยรหัสผ่านใหม่' });
  return { ok: true, message: 'เปลี่ยนรหัสผ่านแล้ว' };
}
