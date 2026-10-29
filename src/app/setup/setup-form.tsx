'use client';

import { useActionState } from 'react';
import { createFirstAdminAction, type SetupResult } from './actions';

const field = 'mt-1 w-full rounded-xl border border-[var(--lp-line)] bg-white px-3 py-3 text-base outline-none focus:border-[var(--lp-accent)]';

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupResult, FormData>(createFirstAdminAction, null);
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5">
      <label className="block text-sm font-medium">ชื่อ<input name="name" required maxLength={80} autoComplete="name" className={field} /></label>
      <label className="block text-sm font-medium">อีเมล<input name="email" type="email" required autoComplete="email" className={field} /></label>
      <label className="block text-sm font-medium">รหัสผ่าน <span className="font-normal text-[var(--lp-muted)]">(อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข)</span><input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} /></label>
      <label className="block text-sm font-medium">ยืนยันรหัสผ่าน<input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={field} /></label>
      {state?.ok === false && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-[var(--lp-accent)] py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 disabled:opacity-60">{pending ? 'กำลังสร้าง...' : 'สร้างผู้ดูแลระบบและเข้าสู่ระบบ'}</button>
    </form>
  );
}
