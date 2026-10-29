'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, ShoppingCart, ClipboardList, ListPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/shop', label: 'หน้าแรก', icon: Home, exact: true },
  { href: '/shop/search', label: 'ค้นหา', icon: Search },
  { href: '/shop/quick', label: 'สั่งเร็ว', icon: ListPlus },
  { href: '/shop/cart', label: 'ตะกร้า', icon: ShoppingCart },
  { href: '/shop/orders', label: 'ออเดอร์', icon: ClipboardList },
];

/** Fixed bottom navigation for the dealer shop on phones; desktop uses `TopNav`. */
export function BottomNav({ cartCount }: { cartCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 md:hidden border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', active ? 'text-primary font-semibold' : 'text-muted-foreground')}>
                <Icon className="size-5" />
                {label}
                {href === '/shop/cart' && cartCount > 0 && (
                  <span className="absolute right-4 top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{cartCount}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Inline header navigation shown from the `md` breakpoint up. */
export function TopNav({ cartCount }: { cartCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="เมนูร้าน" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className={cn('relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm hover:bg-muted', active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground')}>
                <Icon className="size-4" />
                {label}
                {href === '/shop/cart' && cartCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{cartCount}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
