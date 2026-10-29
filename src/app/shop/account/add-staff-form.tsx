'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addDealerStaffAction, type StaffResult } from '../actions';

/** Owner-only form that creates a DEALER_STAFF login and shows the temporary password once. */
export function AddStaffForm() {
  const [state, action, pending] = useActionState<StaffResult, FormData>(addDealerStaffAction, null);
  if (state?.ok) {
    return (
      <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-semibold">สร้างแล้ว ส่งให้พนักงาน (แสดงครั้งเดียว)</p>
        <p>อีเมล <span className="font-mono">{state.email}</span></p>
        <p>รหัสผ่านชั่วคราว <span className="font-mono font-bold">{state.tempPassword}</span></p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <Input name="name" placeholder="ชื่อพนักงาน" required maxLength={80} />
      <Input name="email" type="email" placeholder="อีเมลสำหรับเข้าสู่ระบบ" required />
      {state?.ok === false && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'กำลังสร้าง...' : 'สร้างบัญชีพนักงาน'}</Button>
    </form>
  );
}
