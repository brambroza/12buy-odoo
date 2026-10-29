import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { homeFor, type Role } from '@/lib/auth/roles';
import { BrandLogo } from '@/components/landing/brand-logo';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'เปลี่ยนรหัสผ่าน', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Change-password page shared by dealers and staff; forced after a temporary password. */
export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [user, { next }] = await Promise.all([requireUser(), searchParams]);
  return (
    <div className="landing flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-10">
        <div className="mb-6 text-center">
          <BrandLogo size={56} className="mx-auto rounded-2xl" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">เปลี่ยนรหัสผ่าน</h1>
          <p className="mt-1 text-sm text-[var(--lp-muted)]">{user.mustChangePassword ? 'คุณได้รับรหัสผ่านชั่วคราว กรุณาตั้งรหัสใหม่ก่อนใช้งาน' : user.email}</p>
        </div>
        <PasswordForm forced={user.mustChangePassword} next={next ?? ''} />
        {!user.mustChangePassword && <p className="mt-4 text-center text-sm"><Link href={homeFor(user.role as Role)} className="text-[var(--lp-accent)] hover:underline">กลับ</Link></p>}
      </main>
    </div>
  );
}
