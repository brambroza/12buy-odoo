'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Gauge, LayoutDashboard, FileText, Users, Package, Menu, PanelLeftClose, PanelLeftOpen, MapPinned, Tags, Store, Inbox, Smartphone, UserPlus, ShieldCheck, LogOut, UsersRound, TicketPercent, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SIDEBAR_COOKIE } from '@/lib/backoffice-ui';
import { AdminMotion } from '@/components/admin/admin-motion';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ROLE_LABELS, isAdminRole, type Role } from '@/lib/auth/roles';
import { logoutAction } from '@/app/login/actions';
import { BrandLogo } from '@/components/landing/brand-logo';

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; group?: string; adminOnly?: boolean }[] = [
  { href: '/admin', label: 'แดชบอร์ด', icon: Gauge, group: 'ดีลเลอร์' },
  { href: '/admin/orders', label: 'ออเดอร์จากเว็บ', icon: Inbox },
  { href: '/admin/dealers', label: 'ดีลเลอร์ / ลูกค้า Odoo', icon: Store },
  { href: '/admin/leads', label: 'ใบสมัครดีลเลอร์', icon: UserPlus },
  { href: '/admin/groups', label: 'กลุ่มลูกค้า', icon: UsersRound, adminOnly: true },
  { href: '/admin/zones', label: 'โซนราคา', icon: MapPinned, adminOnly: true },
  { href: '/admin/prices', label: 'ตารางราคา', icon: Tags, adminOnly: true },
  { href: '/admin/coupons', label: 'คูปอง', icon: TicketPercent, adminOnly: true },
  { href: '/admin/delivery', label: 'การจัดส่ง', icon: Truck, adminOnly: true },
  { href: '/admin/users', label: 'ผู้ใช้งานระบบ', icon: ShieldCheck, adminOnly: true },
  { href: '/shop', label: 'เปิดหน้าดีลเลอร์', icon: Smartphone },
  { href: '/dashboard', label: 'ภาพรวม', icon: LayoutDashboard, group: 'Odoo Sync (เดิม)' },
  { href: '/sale-orders', label: 'ใบสั่งขาย', icon: FileText },
  { href: '/customers', label: 'ลูกค้า', icon: Users },
  { href: '/products', label: 'สินค้า', icon: Package },
];

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <BrandLogo size={36} />
      <div className="leading-tight">
        <p className="text-sm font-semibold">12buy Admin</p>
        <p className="text-xs text-muted-foreground">หลังบ้านดีลเลอร์</p>
      </div>
    </div>
  );
}

function NavLinks({ pathname, role, onNavigate }: { pathname: string; role: Role; onNavigate?: () => void }) {
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdminRole(role));
  return (
    <nav className="flex flex-col gap-1">
      {items.flatMap((item, i) => {
        const Icon = item.icon;
        // '/admin' is the dashboard only; every other item also covers its sub-pages.
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        const link = (
          <Link key={item.href} href={item.href} onClick={onNavigate} data-nav-item className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Icon className="size-4" /> {item.label}
          </Link>
        );
        return item.group ? [<p key={`g-${i}`} className={cn('px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', i > 0 && 'mt-4')}>{item.group}</p>, link] : [link];
      })}
    </nav>
  );
}

function UserBox({ user }: { user: { name: string; role: Role } }) {
  return (
    <div className="mt-auto rounded-lg border border-border p-3 text-sm">
      <p className="truncate font-medium">{user.name}</p>
      <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
      <form action={logoutAction} className="mt-2">
        <Button type="submit" variant="outline" size="sm" className="w-full"><LogOut className="size-4" /> ออกจากระบบ</Button>
      </form>
    </div>
  );
}

gsap.registerPlugin(useGSAP);

/** Desktop sidebar width in px (Tailwind w-60). */
const SIDEBAR_WIDTH = 240;

/**
 * Sidebar + top bar for staff pages. Rendered by the `(backoffice)` layout after the session check.
 * On desktop the sidebar can be hidden to give tables the full width; phones use the slide-in menu.
 */
export function BackofficeShell({ user, sidebarOpen: initialSidebarOpen = true, children }: { user: { name: string; role: string }; sidebarOpen?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);
  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
  };
  const role = user.role as Role;
  const aside = useRef<HTMLElement>(null);
  const firstRun = useRef(true);

  // Menu items slide in on first load; afterwards the sidebar glides open/closed when toggled.
  useGSAP(() => {
    const el = aside.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = { width: sidebarOpen ? SIDEBAR_WIDTH : 0, borderRightWidth: sidebarOpen ? 1 : 0 };
    if (firstRun.current) {
      firstRun.current = false;
      gsap.set(el, target);
      if (!reduce && sidebarOpen) gsap.from(el.querySelectorAll('[data-nav-item]'), { x: -12, opacity: 0, duration: 0.35, stagger: 0.03, ease: 'power2.out', clearProps: 'transform,opacity' });
      return;
    }
    if (reduce) { gsap.set(el, target); return; }
    gsap.to(el, { ...target, duration: 0.35, ease: 'power3.inOut' });
    gsap.fromTo(el.firstElementChild, { opacity: sidebarOpen ? 0 : 1, x: sidebarOpen ? -16 : 0 }, { opacity: sidebarOpen ? 1 : 0, x: sidebarOpen ? 0 : -16, duration: 0.3, ease: 'power2.out', clearProps: sidebarOpen ? 'transform,opacity' : '' });
  }, { dependencies: [sidebarOpen], scope: aside });

  return (
    <div className="flex min-h-screen">
      <aside ref={aside} style={{ width: initialSidebarOpen ? SIDEBAR_WIDTH : 0, borderRightWidth: initialSidebarOpen ? 1 : 0 }}
        aria-hidden={!sidebarOpen} inert={!sidebarOpen}
        className="sticky top-0 hidden h-screen shrink-0 overflow-hidden border-border bg-card md:block">
        <div className="flex h-full w-60 flex-col gap-6 overflow-y-auto p-4">
          <Brand />
          <NavLinks pathname={pathname} role={role} />
          <UserBox user={{ name: user.name, role }} />
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden"><Menu className="size-5" /></Button>} />
            <SheetContent side="left" className="flex w-64 flex-col p-4">
              <SheetTitle className="sr-only">เมนู</SheetTitle>
              <Brand />
              <div className="mt-6 flex flex-1 flex-col"><NavLinks pathname={pathname} role={role} onNavigate={() => setOpen(false)} /><UserBox user={{ name: user.name, role }} /></div>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggleSidebar} aria-expanded={sidebarOpen}
            title={sidebarOpen ? 'ซ่อนเมนู' : 'แสดงเมนู'} aria-label={sidebarOpen ? 'ซ่อนเมนู' : 'แสดงเมนู'}>
            {sidebarOpen ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </Button>
          <p className={cn('flex items-center gap-2 text-sm font-medium text-muted-foreground', sidebarOpen && 'md:hidden')}><BrandLogo size={28} /> 12buy Admin</p>
          <p className="ml-auto hidden text-xs text-muted-foreground md:block">{user.name} · {ROLE_LABELS[role]}</p>
        </header>
        <main className="min-w-0 flex-1 bg-muted/30 px-3 py-4 sm:p-4 md:p-6"><AdminMotion>{children}</AdminMotion></main>
      </div>
    </div>
  );
}
