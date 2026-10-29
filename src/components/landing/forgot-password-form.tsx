'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { forgotPasswordAction, type ForgotPasswordResult } from '@/app/forgot-password/actions';

/** Asks for the account email (plus an optional LINE/phone) and files a reset request for the team. */
export function ForgotPasswordForm() {
  // Controlled so React's post-action form reset does not wipe the inputs after a failed attempt.
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [state, action, pending] = useActionState<ForgotPasswordResult, FormData>(forgotPasswordAction, null);

  const field = 'mt-1 w-full rounded-xl border border-[var(--lp-line)] bg-[var(--lp-bg)] px-3 py-3 text-base outline-none placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)]';

  if (state?.ok) {
    return (
      <div role="status" className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5 text-center shadow-2xl shadow-black/10">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden="true" />
        <p className="mt-3 text-sm">{state.message}</p>
        <Link href="/login" className="mt-5 inline-block w-full rounded-full bg-[var(--lp-accent)] py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5 shadow-2xl shadow-black/10">
      <div>
        <label htmlFor="email" className="text-sm font-medium">อีเมลที่ใช้เข้าสู่ระบบ</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="shop@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </div>
      <div className="mt-4">
        <label htmlFor="contact" className="text-sm font-medium">LINE ID หรือเบอร์โทร <span className="font-normal text-[var(--lp-muted)]">(ไม่บังคับ)</span></label>
        <input id="contact" name="contact" type="text" maxLength={60} placeholder="ให้ทีมงานติดต่อกลับ" value={contact} onChange={(e) => setContact(e.target.value)} className={field} />
      </div>
      {state?.ok === false && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="mt-5 w-full rounded-full bg-[var(--lp-accent)] py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
        {pending ? 'กำลังส่งคำขอ...' : 'ขอรีเซ็ตรหัสผ่าน'}
      </button>
      <p className="mt-4 text-center text-[11px] text-[var(--lp-muted)]">ทีมงานจะตรวจสอบตัวตนแล้วส่งรหัสผ่านชั่วคราวให้ เข้าระบบแล้วระบบจะให้ตั้งรหัสใหม่</p>
    </form>
  );
}
