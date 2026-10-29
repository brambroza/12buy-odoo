import Link from 'next/link';
import type { Metadata } from 'next';
import { LogOut, UserCircle } from 'lucide-react';
import { BottomNav, TopNav } from '@/components/shop/bottom-nav';
import { BrandLogo } from '@/components/landing/brand-logo';
import { getDealerProfile } from '@/lib/shop/dealer';
import { getSessionId } from '@/lib/shop/session';
import { getCart } from '@/lib/shop/store';
import { DEALER_TIER_LABELS } from '@/lib/shop/types';
import { requireDealerAccess } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import { logoutAction } from '@/app/login/actions';

export const metadata: Metadata = { title: 'สั่งซื้อยาง — ดีลเลอร์', description: 'ระบบสั่งซื้อสำหรับดีลเลอร์' };
export const dynamic = 'force-dynamic';

/** Dealer shop shell (bottom nav on phones, header nav on desktop): requires a signed-in dealer (or staff impersonating one). */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDealerAccess();
  const [profile, sid] = await Promise.all([getDealerProfile(), getSessionId()]);
  // Badge counts cart lines (รายการ), not tyres.
  const cartCount = (await getCart(sid)).length;
  const staff = isBackofficeRole(user.role as Role);
  return (
    <div className="min-h-screen bg-muted/30 pb-20 md:pb-10">
      {staff && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
          โหมดแอดมิน: กำลังดูหน้าร้านในมุมมอง “{profile.name}” · <Link href="/admin/dealers" className="underline">กลับหลังบ้าน</Link>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-4 px-4 md:h-16 md:max-w-6xl">
          <Link href="/shop" className="flex shrink-0 items-center gap-2 font-bold" aria-label="12buy Dealer หน้าร้าน">
            <BrandLogo size={36} />
            <span className="hidden sm:inline">12buy <span className="text-muted-foreground font-normal">Dealer</span></span>
          </Link>
          <TopNav cartCount={cartCount} />
          <div className="flex items-center gap-2">
            <Link href="/shop/account" className="flex items-center gap-2 text-right text-xs">
              <span className="leading-tight">
                <span className="block max-w-[140px] truncate font-medium lg:max-w-[220px]">{profile.name}</span>
                <span className="text-muted-foreground">{DEALER_TIER_LABELS[profile.tier]} · {profile.province.replace(/^จังหวัด/, '')}</span>
              </span>
              <UserCircle className="size-6 text-muted-foreground" />
            </Link>
            <form action={logoutAction}>
              <button type="submit" aria-label="ออกจากระบบ" className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"><LogOut className="size-4" /></button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4 md:max-w-6xl md:px-6 md:py-6">{children}</main>
      <BottomNav cartCount={cartCount} />
    </div>
  );
}
