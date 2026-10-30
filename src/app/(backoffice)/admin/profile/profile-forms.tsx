'use client';

import { useActionState, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changeMyPasswordAction, updateMyProfileAction, type ProfileResult } from './actions';

/** Inline result line under a form. */
function Result({ state }: { state: ProfileResult }) {
  if (!state) return null;
  return <p role={state.ok ? 'status' : 'alert'} className={state.ok ? 'text-xs text-emerald-700 dark:text-emerald-400' : 'text-xs text-destructive'}>{state.message}</p>;
}

/** Name + phone of the signed-in staff member. Controlled, because React resets uncontrolled forms after an action. */
export function ProfileForm({ name: initialName, phone: initialPhone }: { name: string; phone: string | null }) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [state, action, pending] = useActionState<ProfileResult, FormData>(updateMyProfileAction, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">ชื่อที่แสดง
        <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" className="mt-1" />
      </label>
      <label className="block text-sm font-medium">เบอร์โทร <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
        <Input name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" maxLength={20} autoComplete="tel" className="mt-1" />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}><Save className="size-4" /> {pending ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** Current + new password (typed twice). Fields clear after each submit (React form reset), which suits passwords. */
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ProfileResult, FormData>(changeMyPasswordAction, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">รหัสผ่านปัจจุบัน
        <Input name="current" type="password" required autoComplete="current-password" className="mt-1" />
      </label>
      <label className="block text-sm font-medium">รหัสผ่านใหม่ <span className="font-normal text-muted-foreground">(อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข)</span>
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-1" />
      </label>
      <label className="block text-sm font-medium">ยืนยันรหัสผ่านใหม่
        <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="mt-1" />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}><KeyRound className="size-4" /> {pending ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}</Button>
        <Result state={state} />
      </div>
    </form>
  );
}
