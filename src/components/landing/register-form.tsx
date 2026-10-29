'use client';

import { useActionState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { registerDealerAction, type RegisterResult } from '@/app/actions/register-dealer';
import { PROVINCES } from '@/lib/provinces';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';

const TYPES = Object.entries(DEALER_TYPE_LABELS) as [DealerType, string][];
const field = 'mt-1 w-full rounded-xl border border-[var(--lp-line)] bg-white px-3 py-3 text-base outline-none placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)]';

/** Public dealer sign-up form. Submits to `registerDealerAction`; LINE remains the alternative path. */
export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterResult, FormData>(registerDealerAction, null);

  if (state?.ok) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-5" aria-hidden="true" /> ส่งข้อมูลเรียบร้อย</p>
        <p className="mt-1 text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="shopName" className="text-sm font-medium">ชื่อร้าน</label>
        <input id="shopName" name="shopName" required maxLength={120} autoComplete="organization" placeholder="เช่น ร้านยางสมชาย" className={field} aria-invalid={state?.ok === false && state.field === 'shopName' ? true : undefined} />
      </div>
      <div>
        <label htmlFor="province" className="text-sm font-medium">จังหวัด</label>
        <select id="province" name="province" required defaultValue="" className={field} aria-invalid={state?.ok === false && state.field === 'province' ? true : undefined}>
          <option value="" disabled>เลือกจังหวัด</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="phone" className="text-sm font-medium">เบอร์โทร</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="08x-xxx-xxxx" className={field} aria-invalid={state?.ok === false && state.field === 'phone' ? true : undefined} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="lineId" className="text-sm font-medium">LINE ID <span className="font-normal text-[var(--lp-muted)]">(ถ้ามี)</span></label>
        <input id="lineId" name="lineId" maxLength={60} placeholder="@yourshop" className={field} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium">หมวดสินค้าที่ขาย</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPES.map(([value, label]) => (
            <label key={value} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--lp-line)] bg-white px-3 py-1.5 text-sm has-[:checked]:border-[var(--lp-accent)] has-[:checked]:bg-[var(--lp-accent-soft)] has-[:checked]:text-[var(--lp-accent)]">
              <input type="checkbox" name="types" value={value} className="accent-[var(--lp-accent)]" /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state?.ok === false && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 py-3.5 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 sm:col-span-2">
        {pending ? 'กำลังส่ง...' : 'ส่งข้อมูลสมัครดีลเลอร์'}
      </button>
      <p className="text-xs text-[var(--lp-muted)] sm:col-span-2">ไม่มีค่าสมัคร ทีมงานตรวจสอบและติดต่อกลับภายใน 1 วันทำการ</p>
    </form>
  );
}
