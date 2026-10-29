'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Eye, EyeOff } from 'lucide-react';
import { loginAction, type LoginResult } from '@/app/login/actions';

const REASONS: Record<string, string> = {
  pending: 'ร้านของคุณรออนุมัติ ทีมงานจะเปิดสิทธิ์ภายใน 1 วันทำการ',
  suspended: 'ร้านของคุณถูกระงับการใช้งาน ติดต่อฝ่ายขาย',
  'no-dealer': 'บัญชีนี้ยังไม่ได้ผูกกับร้าน ติดต่อแอดมิน',
  expired: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
};

/** Email + password sign-in. Posts to `loginAction`, which redirects to `?next=` or the role home. */
export function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '';
  const reason = params.get('reason');
  const card = useRef<HTMLFormElement>(null);
  const [show, setShow] = useState(false);
  // Controlled so React's post-action form reset does not wipe the email after a failed attempt.
  const [email, setEmail] = useState('');
  const [state, action, pending] = useActionState<LoginResult, FormData>(loginAction, null);

  useGSAP(
    () => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(card.current, { y: 24, opacity: 0, duration: 0.7, ease: 'power3.out' });
        gsap.from('[data-field]', { y: 12, opacity: 0, duration: 0.5, stagger: 0.08, delay: 0.2, ease: 'power2.out' });
      });
    },
    { scope: card },
  );

  const field = 'mt-1 w-full rounded-xl border border-[var(--lp-line)] bg-[var(--lp-bg)] px-3 py-3 text-base outline-none placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)]';

  return (
    <form ref={card} action={action} className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5 shadow-2xl shadow-black/10">
      <input type="hidden" name="next" value={next} />
      {reason && REASONS[reason] && <p role="status" className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-800">{REASONS[reason]}</p>}
      <div data-field>
        <label htmlFor="email" className="text-sm font-medium">อีเมล</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="shop@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </div>
      <div data-field className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="password" className="text-sm font-medium">รหัสผ่าน</label>
          <Link href="/forgot-password" className="text-sm text-[var(--lp-accent)] underline-offset-2 hover:underline">ลืมรหัสผ่าน?</Link>
        </div>
        <div className="relative mt-1">
          <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className={`${field} mt-0 pr-11`} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--lp-muted)] hover:text-[var(--lp-fg)]">
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>
      <label data-field className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="remember" defaultChecked className="size-4 accent-[var(--lp-accent)]" />
        จดจำฉันไว้ <span className="text-xs text-[var(--lp-muted)]">(ไม่ต้องเข้าระบบใหม่ 30 วัน)</span>
      </label>
      {state?.ok === false && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      {/* GSAP animates the wrapper: on the button itself its CSS `transition` makes gsap.from read opacity 0 as the end value and leaves it invisible. */}
      <div data-field className="mt-5">
        <button type="submit" disabled={pending} className="w-full rounded-full bg-[var(--lp-accent)] py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
          {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </div>
      <p data-field className="mt-4 text-center text-[11px] text-[var(--lp-muted)]">ใช้เครื่องร่วมกับผู้อื่น? เอาเครื่องหมายออกจาก “จดจำฉันไว้”</p>
    </form>
  );
}
