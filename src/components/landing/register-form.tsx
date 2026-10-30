'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { registerDealerAction, type RegisterResult } from '@/app/actions/register-dealer';
import { ThaiAddressFields } from '@/components/shop/thai-address-fields';
import { TurnstileWidget } from '@/components/security/turnstile-widget';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';

const TYPES = Object.entries(DEALER_TYPE_LABELS) as [DealerType, string][];
const field = 'mt-1 w-full rounded-xl border border-[var(--lp-line)] bg-white px-3 py-3 text-base outline-none placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)] aria-[invalid=true]:border-red-500 disabled:bg-neutral-100 disabled:opacity-70';
const label = 'text-sm font-medium';
const section = 'text-base font-bold sm:col-span-2';

/**
 * Public dealer sign-up: shop, tax id, full address (province → district → subdistrict), contact,
 * product families, the owner's login (email + password twice) and a Cloudflare Turnstile check.
 * After an error the form is refilled from what the server sent back (passwords excepted).
 */
export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterResult, FormData>(registerDealerAction, null);
  const [showPassword, setShowPassword] = useState(false);

  if (state?.ok) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-5" aria-hidden="true" /> ส่งใบสมัครเรียบร้อย</p>
        <p className="mt-1 text-sm">{state.message}</p>
      </div>
    );
  }

  const failed = state?.ok === false ? state : null;
  const values = failed?.values;
  const invalid = (name: string) => (failed?.field === name ? true : undefined);

  return (
    // Remount after each failed attempt so uncontrolled inputs take the refilled defaults.
    <form key={failed?.attempt ?? 0} action={action} noValidate className="grid gap-3 sm:grid-cols-2">
      <p className={section}>ข้อมูลร้าน</p>
      <div className="sm:col-span-2">
        <label htmlFor="shopName" className={label}>ชื่อร้าน</label>
        <input id="shopName" name="shopName" required maxLength={120} autoComplete="organization" defaultValue={values?.shopName} placeholder="เช่น ร้านยางสมชาย" className={field} aria-invalid={invalid('shopName')} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="taxId" className={label}>เลขประจำตัวผู้เสียภาษี <span className="font-normal text-[var(--lp-muted)]">(13 หลัก ของร้าน/บริษัท หรือเลขบัตรประชาชนเจ้าของร้าน)</span></label>
        <input id="taxId" name="taxId" inputMode="numeric" autoComplete="off" required maxLength={17} defaultValue={values?.taxId} placeholder="0-1055-56123-45-6" className={field} aria-invalid={invalid('taxId')} />
        {failed?.hint === 'activate' && (
          <p className="mt-1 text-sm"><Link href="/activate" className="font-medium text-[var(--lp-accent)] underline">ไปหน้าเปิดใช้บัญชีลูกค้าเดิม</Link></p>
        )}
      </div>
      <div className="sm:col-span-2">
        <ThaiAddressFields
          defaultValue={values?.address.province ? values.address : null}
          invalidField={failed?.field}
          classes={{ input: field, select: field, label }}
        />
      </div>
      <div>
        <label htmlFor="phone" className={label}>เบอร์โทร</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={values?.phone} placeholder="08x-xxx-xxxx" className={field} aria-invalid={invalid('phone')} />
      </div>
      <div>
        <label htmlFor="lineId" className={label}>LINE ID <span className="font-normal text-[var(--lp-muted)]">(ถ้ามี)</span></label>
        <input id="lineId" name="lineId" maxLength={60} defaultValue={values?.lineId} placeholder="@yourshop" className={field} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={label}>หมวดสินค้าที่ขาย</legend>
        <div className="mt-2 flex flex-wrap gap-2" aria-invalid={invalid('types')}>
          {TYPES.map(([value, text]) => (
            <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--lp-line)] bg-white px-3 py-1.5 text-sm has-[:checked]:border-[var(--lp-accent)] has-[:checked]:bg-[var(--lp-accent-soft)] has-[:checked]:text-[var(--lp-accent)]">
              <input type="checkbox" name="types" value={value} defaultChecked={values?.types.includes(value)} className="accent-[var(--lp-accent)]" /> {text}
            </label>
          ))}
        </div>
      </fieldset>

      <p className={`${section} mt-2`}>บัญชีเข้าสู่ระบบ</p>
      <div className="sm:col-span-2">
        <label htmlFor="email" className={label}>อีเมล</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} defaultValue={values?.email} placeholder="shop@example.com" className={field} aria-invalid={invalid('email')} />
      </div>
      <div>
        <label htmlFor="password" className={label}>รหัสผ่าน</label>
        <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} className={field} aria-invalid={invalid('password')} aria-describedby="password-hint" />
      </div>
      <div>
        <label htmlFor="confirmPassword" className={label}>ยืนยันรหัสผ่าน</label>
        <input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} className={field} aria-invalid={invalid('confirmPassword')} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        <p id="password-hint" className="text-xs text-[var(--lp-muted)]">อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข · ใช้เข้าสู่ระบบหลังร้านได้รับอนุมัติ</p>
        <button type="button" onClick={() => setShowPassword((v) => !v)} className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--lp-muted)]">
          {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          {showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        </button>
      </div>

      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <TurnstileWidget resetKey={failed?.attempt ?? 0} />
      </div>
      {failed && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:col-span-2">{failed.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 sm:col-span-2">
        {pending ? 'กำลังส่ง...' : 'ส่งใบสมัครดีลเลอร์'}
      </button>
      <p className="text-xs text-[var(--lp-muted)] sm:col-span-2">ไม่มีค่าสมัคร ทีมงานตรวจสอบและติดต่อกลับภายใน 1 วันทำการ · มีบัญชีแล้ว? <Link href="/login" className="underline">เข้าสู่ระบบ</Link></p>
    </form>
  );
}
