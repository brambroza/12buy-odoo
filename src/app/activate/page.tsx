import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ActivateForm } from '@/components/landing/activate-form';
import { BrandLogo } from '@/components/landing/brand-logo';
import { SITE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'เปิดใช้บัญชีลูกค้าเดิม',
  description: `ร้านที่เป็นลูกค้า ${SITE.name} อยู่แล้ว เปิดบัญชีสั่งซื้อออนไลน์ได้ทันที`,
  robots: { index: false, follow: false },
};

/** Public page where an existing Odoo customer opens its own web login. */
export default function ActivatePage() {
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
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">เปิดใช้บัญชีลูกค้าเดิม</h1>
          <p className="mt-1 text-sm text-[var(--lp-muted)]">ร้านที่ซื้อกับเราอยู่แล้ว ยืนยันด้วยเลขผู้เสียภาษีและเบอร์โทร แล้วสั่งซื้อออนไลน์ได้ทันที ไม่ต้องรออนุมัติ</p>
        </div>
        <ActivateForm />
      </main>
    </div>
  );
}
