import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/landing/brand-logo';
import { ForgotPasswordForm } from '@/components/landing/forgot-password-form';
import { SITE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'ลืมรหัสผ่าน',
  description: `ขอรีเซ็ตรหัสผ่าน ${SITE.name}`,
  robots: { index: false, follow: false },
};

/** Public "forgot password" page. Files a request that an admin resolves with a temporary password. */
export default function ForgotPasswordPage() {
  return (
    <div className="landing flex min-h-screen flex-col">
      <div className="lp-glow pointer-events-none absolute inset-x-0 top-0 h-[360px]" aria-hidden="true" />
      <header className="relative mx-auto flex h-14 w-full max-w-md items-center px-4">
        <Link href="/login" className="flex items-center gap-1.5 text-sm text-[var(--lp-muted)] hover:text-[var(--lp-fg)]">
          <ArrowLeft className="size-4" aria-hidden="true" /> กลับไปเข้าสู่ระบบ
        </Link>
      </header>
      <main className="relative mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-6">
        <div className="mb-6 text-center">
          <BrandLogo size={64} className="mx-auto rounded-2xl shadow-lg shadow-[var(--lp-accent)]/20" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">ลืมรหัสผ่าน</h1>
          <p className="mt-1 text-sm text-[var(--lp-muted)]">กรอกอีเมลที่ใช้เข้าสู่ระบบ ทีมงานจะติดต่อกลับพร้อมรหัสผ่านชั่วคราว</p>
        </div>
        <ForgotPasswordForm />
      </main>
    </div>
  );
}
