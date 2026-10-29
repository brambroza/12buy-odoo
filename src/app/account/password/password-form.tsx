'use client';

import { useActionState } from 'react';
import { changePasswordAction, type PasswordResult } from './actions';

const field = 'mt-1 w-full rounded-xl border border-[var(--lp-line)] bg-white px-3 py-3 text-base outline-none focus:border-[var(--lp-accent)]';

export function PasswordForm({ forced, next }: { forced: boolean; next: string }) {
  const [state, action, pending] = useActionState<PasswordResult, FormData>(changePasswordAction, null);
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5">
      <input type="hidden" name="next" value={next} />
      {!forced && <label className="block text-sm font-medium">รหัสผ่านปัจจุบัน<input name="current" type="password" required autoComplete="current-password" className={field} /></label>}
      <label className="block text-sm font-medium">รหัสผ่านใหม่ <span className="font-normal text-[var(--lp-muted)]">(อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข)</span><input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} /></label>
      <label className="block text-sm font-medium">ยืนยันรหัสผ่านใหม่<input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={field} /></label>
      {state?.ok === false && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-[var(--lp-accent)] py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 disabled:opacity-60">{pending ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</button>
    </form>
  );
}
