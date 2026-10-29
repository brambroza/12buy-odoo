'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { activateOdooDealerAction, type ActivateResult } from '@/app/activate/actions';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';

const TYPES = Object.entries(DEALER_TYPE_LABELS) as [DealerType, string][];

/** Existing Odoo customer opens its web account: tax id + phone on file, product families, then the owner login. */
export function ActivateForm() {
  // Controlled so React's post-action form reset does not wipe the inputs after a failed attempt.
  const [values, setValues] = useState({ taxId: '', phone: '', email: '' });
  const [types, setTypes] = useState<DealerType[]>([]);
  const [show, setShow] = useState(false);
  const [state, action, pending] = useActionState<ActivateResult, FormData>(activateOdooDealerAction, null);

  const field = 'mt-1 w-full rounded-xl border border-[var(--lp-line)] bg-[var(--lp-bg)] px-3 py-3 text-base outline-none placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)] aria-[invalid=true]:border-red-500';
  const invalid = (name: string) => state?.field === name || undefined;
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const toggle = (type: DealerType) => setTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]));

  return (
    <form action={action} noValidate className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5 shadow-2xl shadow-black/10">
      <p className="text-sm font-semibold">ยืนยันร้านของคุณ</p>
      <p className="mt-0.5 text-xs text-[var(--lp-muted)]">กรอกให้ตรงกับที่ใช้เปิดบิลกับเรา</p>
      <div className="mt-3">
        <label htmlFor="taxId" className="text-sm font-medium">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
        <input id="taxId" name="taxId" inputMode="numeric" autoComplete="off" required maxLength={20} placeholder="0105xxxxxxxxx" value={values.taxId} onChange={set('taxId')} className={field} aria-invalid={invalid('taxId')} />
      </div>
      <div className="mt-4">
        <label htmlFor="phone" className="text-sm font-medium">เบอร์โทรของร้าน</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="08x-xxx-xxxx" value={values.phone} onChange={set('phone')} className={field} aria-invalid={invalid('phone')} />
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">หมวดสินค้าที่ขาย</legend>
        <div className="mt-2 flex flex-wrap gap-2" aria-invalid={invalid('types')}>
          {TYPES.map(([value, text]) => (
            <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--lp-line)] bg-white px-3 py-1.5 text-sm has-[:checked]:border-[var(--lp-accent)] has-[:checked]:bg-[var(--lp-accent-soft)] has-[:checked]:text-[var(--lp-accent)]">
              <input type="checkbox" name="types" value={value} checked={types.includes(value)} onChange={() => toggle(value)} className="accent-[var(--lp-accent)]" /> {text}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-6 text-sm font-semibold">ตั้งบัญชีเข้าสู่ระบบ</p>
      <div className="mt-3">
        <label htmlFor="email" className="text-sm font-medium">อีเมล</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder="shop@example.com" value={values.email} onChange={set('email')} className={field} aria-invalid={invalid('email')} />
      </div>
      <div className="mt-4">
        <label htmlFor="password" className="text-sm font-medium">รหัสผ่าน</label>
        <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} className={field} aria-invalid={invalid('password')} aria-describedby="password-hint" />
      </div>
      <div className="mt-4">
        <label htmlFor="confirmPassword" className="text-sm font-medium">ยืนยันรหัสผ่าน</label>
        <input id="confirmPassword" name="confirmPassword" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} className={field} aria-invalid={invalid('confirmPassword')} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id="password-hint" className="text-xs text-[var(--lp-muted)]">อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข</p>
        <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--lp-muted)]">
          {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          {show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        </button>
      </div>

      <div className="mt-4">
        <TurnstileWidget resetKey={state?.attempt ?? 0} />
      </div>
      {state?.ok === false && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="mt-5 w-full rounded-full bg-[var(--lp-accent)] py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
        {pending ? 'กำลังตรวจสอบ...' : 'เปิดใช้บัญชีและเข้าสู่ระบบ'}
      </button>
      <p className="mt-4 text-center text-xs text-[var(--lp-muted)]">ยังไม่เคยเป็นลูกค้า? <Link href="/#register" className="underline">สมัครเป็นดีลเลอร์</Link></p>
    </form>
  );
}
