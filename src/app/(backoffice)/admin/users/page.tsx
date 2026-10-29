import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreateUserForm, ResetPasswordButton } from '@/components/admin/credential-forms';
import { requireAdmin } from '@/lib/auth/session';
import { ROLE_LABELS, canManageRole, type Role } from '@/lib/auth/roles';
import { listPendingResetRequests } from '@/lib/auth/reset-requests';
import { listStaffUsers } from '@/lib/auth/users';
import { cn } from '@/lib/utils';
import { createStaffUserAction, dismissResetRequestAction, resetPasswordAction, toggleUserActiveAction } from '../dealer-actions';

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/** Back-office accounts. Dealer logins are managed from the dealer page instead. */
export default async function UsersPage() {
  const actor = await requireAdmin();
  const users = await listStaffUsers();
  const resetRequests = (await listPendingResetRequests())
    .filter((r) => canManageRole(actor.role as Role, r.user.role as Role));
  const roles = (['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE'] as Role[]).filter((r) => canManageRole(actor.role as Role, r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ผู้ใช้งานระบบ</h1>
        <p className="text-sm text-muted-foreground">บัญชีทีมงาน (แอดมิน / ฝ่ายขาย / คลัง) · บัญชีของร้านดีลเลอร์จัดการที่หน้า “ดีลเลอร์”</p>
      </div>
      {resetRequests.length > 0 && (
        <section aria-labelledby="reset-requests-heading" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <p id="reset-requests-heading" className="font-semibold">คำขอรีเซ็ตรหัสผ่าน ({resetRequests.length})</p>
          <p className="text-xs text-muted-foreground">ยืนยันตัวตนผู้ขอก่อน แล้วกด “รีเซ็ตรหัส” ส่งรหัสชั่วคราวให้ทาง LINE คำขอจะปิดให้อัตโนมัติ</p>
          <ul className="mt-2 divide-y divide-amber-200 dark:divide-amber-500/30">
            {resetRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{r.user.name}</span>
                <Badge variant="outline">{ROLE_LABELS[r.user.role as Role]}</Badge>
                <span className="text-xs text-muted-foreground">{r.user.email}{r.user.dealer && ` · ${r.user.dealer.name}`}{r.contact && ` · ติดต่อ: ${r.contact}`} · ขอเมื่อ {fmt.format(r.createdAt)}</span>
                <span className="ml-auto flex items-center gap-2">
                  <ResetPasswordButton action={resetPasswordAction} userId={r.userId} />
                  <form action={dismissResetRequestAction}><input type="hidden" name="requestId" value={r.id} /><Button type="submit" size="xs" variant="ghost">ปิดคำขอ</Button></form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 text-sm font-semibold">เพิ่มผู้ใช้ทีมงาน</p>
        <CreateUserForm action={createStaffUserAction} hidden={{}} roles={roles.length ? roles.filter((r) => r.value !== 'SUPER_ADMIN').concat(roles.filter((r) => r.value === 'SUPER_ADMIN')) : []} />
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className={cn('font-medium', !u.isActive && 'line-through text-muted-foreground')}>{u.name}</span>
            <Badge variant="outline">{ROLE_LABELS[u.role as Role]}</Badge>
            <span className="text-xs text-muted-foreground">{u.email}{u.mustChangePassword && ' · รอตั้งรหัสใหม่'}{u.lastLoginAt && ` · เข้าล่าสุด ${fmt.format(u.lastLoginAt)}`}{u.id === actor.id && ' · คุณ'}</span>
            {u.id !== actor.id && canManageRole(actor.role as Role, u.role as Role) && (
              <span className="ml-auto flex items-center gap-2">
                <ResetPasswordButton action={resetPasswordAction} userId={u.id} />
                <form action={toggleUserActiveAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="back" value="/admin/users" /><Button type="submit" size="xs" variant="ghost">{u.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</Button></form>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
