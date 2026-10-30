import Link from 'next/link';
import { Check, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DealerAvatar } from '@/components/shop/dealer-avatar';
import { AvatarForm } from '@/app/shop/account/avatar-form';
import { requireBackoffice } from '@/lib/auth/session';
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, isAdminRole, type Role } from '@/lib/auth/roles';
import { updateMyAvatarAction } from './actions';
import { ChangePasswordForm, ProfileForm } from './profile-forms';

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/** Signed-in staff member's own profile: picture, name, phone, password, and what their role allows. */
export default async function MyProfilePage() {
  const user = await requireBackoffice();
  const role = user.role as Role;
  const allowed = PERMISSIONS.filter((p) => p.roles.includes(role));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">โปรไฟล์ของฉัน</h1>
        <p className="text-sm text-muted-foreground">แก้ชื่อ เบอร์โทร รูปโปรไฟล์ และรหัสผ่านของบัญชีคุณ</p>
      </div>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
        <DealerAvatar name={user.name} avatarFile={user.avatarFile ?? null} size={80} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-lg font-semibold">{user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{ROLE_LABELS[role]}</Badge>
            <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">ใช้งานอยู่</Badge>
            {user.lastLoginAt && <span className="text-xs text-muted-foreground">เข้าล่าสุด {fmt.format(user.lastLoginAt)}</span>}
          </div>
        </div>
        <AvatarForm hasAvatar={!!user.avatarFile} action={updateMyAvatarAction} />
      </section>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <section aria-labelledby="profile-heading" className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 id="profile-heading" className="flex items-center gap-2 font-semibold"><UserRound className="size-4" /> ข้อมูลส่วนตัว</h2>
          <ProfileForm name={user.name} phone={user.phone ?? null} />
          <p className="text-xs text-muted-foreground">อีเมลเข้าสู่ระบบและบทบาทเปลี่ยนได้โดยแอดมินเท่านั้น</p>
        </section>

        <section id="password" aria-labelledby="password-heading" className="scroll-mt-20 space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 id="password-heading" className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> เปลี่ยนรหัสผ่าน</h2>
          <ChangePasswordForm />
        </section>
      </div>

      <section aria-labelledby="perm-heading" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="perm-heading" className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> สิทธิ์ของฉัน · {ROLE_LABELS[role]}</h2>
          {isAdminRole(role) && <Link href="/admin/users/roles" className="text-sm text-primary hover:underline">ดูสิทธิ์ทุกบทบาท</Link>}
        </div>
        {ROLE_DESCRIPTIONS[role] && <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>}
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {allowed.map((p) => <li key={p.label} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {p.label}</li>)}
        </ul>
      </section>
    </div>
  );
}
