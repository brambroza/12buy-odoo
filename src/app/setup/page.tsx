import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { countUsers } from '@/lib/auth/users';
import { BrandLogo } from '@/components/landing/brand-logo';
import { SetupForm } from './setup-form';

export const metadata: Metadata = { title: 'ตั้งค่าเริ่มต้น', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** First-run page: only reachable while the User table is empty. */
export default async function SetupPage() {
  if ((await countUsers()) > 0) redirect('/login');
  return (
    <div className="landing flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-12">
        <div className="mb-6 text-center">
          <BrandLogo size={64} className="mx-auto rounded-2xl shadow-lg shadow-[var(--lp-accent)]/20" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">สร้างผู้ดูแลระบบคนแรก</h1>
          <p className="mt-1 text-sm text-[var(--lp-muted)]">หน้านี้ใช้ได้ครั้งเดียวตอนยังไม่มีผู้ใช้ในระบบ หลังจากนั้นจะปิดอัตโนมัติ</p>
        </div>
        <SetupForm />
      </main>
    </div>
  );
}
