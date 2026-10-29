import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LoginForm } from '@/components/landing/login-form';
import { SITE } from '@/lib/seo';
import { BrandLogo } from '@/components/landing/brand-logo';

export const metadata: Metadata = {
  title: 'เข้าสู่ระบบดีลเลอร์',
  description: `เข้าสู่ระบบ ${SITE.name} เพื่อดูราคาของร้านและสั่งซื้อยาง`,
  robots: { index: false, follow: false },
};

/** Public login page for dealers (prototype, no real auth yet). */
export default function LoginPage() {
  return (
    <div className="landing flex min-h-screen flex-col">
      <div className="lp-glow pointer-events-none absolute inset-x-0 top-0 h-[360px]" aria-hidden="true" />
      <header className="relative mx-auto flex h-14 w-full max-w-md items-center px-4">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-[var(--lp-muted)] hover:text-[var(--lp-fg)]">
          <ArrowLeft className="size-4" aria-hidden="true" /> หน้าแรก
        </Link>
      </header>
      <main className="relative mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-6">
        <div className="mb-6 text-center">
          <BrandLogo size={64} className="mx-auto rounded-2xl shadow-lg shadow-[var(--lp-accent)]/20" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">เข้าสู่ระบบดีลเลอร์</h1>
          <p className="mt-1 text-sm text-[var(--lp-muted)]">ดูราคาของร้าน สั่งซื้อ และติดตามออเดอร์</p>
        </div>
        <Suspense fallback={<div className="h-[420px] rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)]" aria-hidden="true" />}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-[var(--lp-muted)]">
          ยังไม่มีบัญชี? <Link href="/#register" className="text-[var(--lp-accent)] underline-offset-2 hover:underline">สมัครเป็นดีลเลอร์</Link>
        </p>
      </main>
    </div>
  );
}
