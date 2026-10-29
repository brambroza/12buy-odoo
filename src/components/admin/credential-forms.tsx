'use client';

import { useActionState } from 'react';
import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notify } from '@/components/ui/notify';

export type CredentialResult = { ok: true; message: string; email?: string; tempPassword?: string } | { ok: false; message: string } | null;
type CredentialAction = (prev: CredentialResult, formData: FormData) => Promise<CredentialResult>;

/** Shows a freshly generated temporary password exactly once, with a copy button. */
function TempPassword({ email, password }: { email?: string; password: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const text = `อีเมล: ${email ?? ''}\nรหัสผ่านชั่วคราว: ${password}\nเข้าสู่ระบบที่ ${origin}/login แล้วตั้งรหัสใหม่`;
  return (
    <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-semibold">สร้างแล้ว ส่งรหัสนี้ให้ผู้ใช้ทาง LINE (แสดงครั้งเดียว)</p>
      {email && <p className="mt-1">อีเมล: <span className="font-mono">{email}</span></p>}
      <p>รหัสผ่านชั่วคราว: <span className="font-mono text-base font-bold">{password}</span></p>
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard?.writeText(text).then(
        () => notify.success('คัดลอกข้อความแล้ว', { id: 'copy-credential', icon: 'check', description: 'วางส่งให้ผู้ใช้ทาง LINE ได้เลย' }),
        () => notify.warning('คัดลอกไม่ได้', { id: 'copy-credential', description: 'เลือกข้อความแล้วคัดลอกเอง' }),
      ) ?? notify.warning('คัดลอกไม่ได้', { id: 'copy-credential', description: 'เบราว์เซอร์ไม่อนุญาต เลือกข้อความแล้วคัดลอกเอง' })}><Copy className="size-3.5" /> คัดลอกข้อความ</Button>
    </div>
  );
}

/** Create a login (dealer owner/staff or back-office staff). `hidden` carries ids; `roles` fills the role select. */
export function CreateUserForm({ action, hidden, roles }: { action: CredentialAction; hidden: Record<string, string>; roles: { value: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<CredentialResult, FormData>(action, null);
  if (state?.ok && state.tempPassword) return <TempPassword email={state.email} password={state.tempPassword} />;
  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_auto_auto]">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Input name="name" placeholder="ชื่อผู้ใช้" required maxLength={80} />
      <Input name="email" type="email" placeholder="อีเมลสำหรับเข้าสู่ระบบ" required />
      <select name="role" aria-label="บทบาท" className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" defaultValue={roles[0]?.value}>
        {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <Button type="submit" size="sm" disabled={pending}><UserPlus className="size-4" /> {pending ? 'กำลังสร้าง...' : 'สร้างผู้ใช้'}</Button>
      {state?.ok === false && <p role="alert" className="text-xs text-destructive sm:col-span-full">{state.message}</p>}
    </form>
  );
}

/** One-click temporary password reset; reveals the new password once. */
export function ResetPasswordButton({ action, userId }: { action: CredentialAction; userId: string }) {
  const [state, formAction, pending] = useActionState<CredentialResult, FormData>(action, null);
  if (state?.ok && state.tempPassword) return <TempPassword email={state.email} password={state.tempPassword} />;
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="xs" variant="outline" disabled={pending}><KeyRound className="size-3" /> รีเซ็ตรหัส</Button>
      {state?.ok === false && <span className="ml-2 text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
