'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Gauge, LayoutDashboard, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, MapPinned, Tags, Store, Inbox, Smartphone, UserPlus, ShieldCheck, LogOut, UsersRound, TicketPercent, BadgePercent, Truck, UserRound, KeyRound, ChevronDown, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SIDEBAR_COOKIE } from '@/lib/backoffice-ui';
import { AdminMotion } from '@/components/admin/admin-motion';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NotificationBell } from '@/components/admin/notification-bell';
import { DealerAvatar } from '@/components/shop/dealer-avatar';
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
  { href: '/admin/cash-discounts', label: 'ส่วนลดเงินสด', icon: BadgePercent, adminOnly: true },
  { href: '/admin/coupons', label: 'คูปอง', icon: TicketPercent, adminOnly: true },
  { href: '/admin/delivery', label: 'การจัดส่ง', icon: Truck, adminOnly: true },
  { href: '/admin/promotions', label: 'โปรโมชันหน้าแรก', icon: Megaphone, adminOnly: true },
  { href: '/admin/users', label: 'ผู้ใช้งานระบบ', icon: ShieldCheck, adminOnly: true },
  { href: '/admin/settings', label: 'ตั้งค่าระบบ (Odoo · LINE)', icon: Plug, adminOnly: true },
  { href: '/shop', label: 'เปิดหน้าดีลเลอร์', icon: Smartphone },
  // Legacy "Odoo Sync (เดิม)" demo (/dashboard, /sale-orders, /customers, /products) is kept reachable by URL
  // for reference but no longer listed: dealer ordering replaced it.
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

type ShellUser = { name: string; role: string; email?: string; avatarFile?: string | null };

function UserBox({ user, onNavigate }: { user: ShellUser & { role: Role }; onNavigate?: () => void }) {
  return (
    <div className="mt-auto rounded-lg border border-border p-3 text-sm">
      <Link href="/admin/profile" onClick={onNavigate} className="-m-1 flex items-center gap-2 rounded-md p-1 hover:bg-muted">
        <DealerAvatar name={user.name} avatarFile={user.avatarFile ?? null} size={32} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
        </span>
      </Link>
      <form action={logoutAction} className="mt-2">
        <Button type="submit" variant="outline" size="sm" className="w-full"><LogOut className="size-4" /> ออกจากระบบ</Button>
      </form>
    </div>
  );
}

/** Top-bar account menu: avatar + name, links to the profile and password, and sign out. */
function UserMenu({ user }: { user: ShellUser & { role: Role } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button variant="ghost" className="h-10 gap-2 px-1.5 sm:px-2" aria-label={`บัญชีของ ${user.name}`}>
          <DealerAvatar name={user.name} avatarFile={user.avatarFile ?? null} size={30} />
          <span className="hidden max-w-40 text-left leading-tight md:block">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
        </Button>
      } />
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-1.5 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/admin/profile" />}><UserRound /> โปรไฟล์ของฉัน</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/admin/profile#password" />}><KeyRound /> เปลี่ยนรหัสผ่าน</DropdownMenuItem>
        {isAdminRole(user.role) && <DropdownMenuItem render={<Link href="/admin/users" />}><ShieldCheck /> ผู้ใช้และสิทธิ์</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => (document.getElementById('backoffice-logout') as HTMLFormElement | null)?.requestSubmit()}>
          <LogOut /> ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

gsap.registerPlugin(useGSAP);

/** Desktop sidebar width in px (Tailwind w-60). */
const SIDEBAR_WIDTH = 240;

/**
 * Sidebar + top bar for staff pages. Rendered by the `(backoffice)` layout after the session check.
 * On desktop the sidebar can be hidden to give tables the full width; phones use the slide-in menu.
 */
export function BackofficeShell({ user, sidebarOpen: initialSidebarOpen = true, children }: { user: ShellUser; sidebarOpen?: boolean; children: React.ReactNode }) {
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
          <UserBox user={{ ...user, role }} />
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden"><Menu className="size-5" /></Button>} />
            <SheetContent side="left" className="flex w-64 flex-col p-4">
              <SheetTitle className="sr-only">เมนู</SheetTitle>
              <Brand />
              <div className="mt-6 flex flex-1 flex-col"><NavLinks pathname={pathname} role={role} onNavigate={() => setOpen(false)} /><UserBox user={{ ...user, role }} onNavigate={() => setOpen(false)} /></div>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggleSidebar} aria-expanded={sidebarOpen}
            title={sidebarOpen ? 'ซ่อนเมนู' : 'แสดงเมนู'} aria-label={sidebarOpen ? 'ซ่อนเมนู' : 'แสดงเมนู'}>
            {sidebarOpen ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </Button>
          <p className={cn('flex items-center gap-2 text-sm font-medium text-muted-foreground', sidebarOpen && 'md:hidden')}><BrandLogo size={28} /> 12buy Admin</p>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu user={{ ...user, role }} />
          </div>
          <form id="backoffice-logout" action={logoutAction} className="hidden" />
        </header>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-muted/30 px-3 py-4 outline-none sm:p-4 md:p-6"><AdminMotion>{children}</AdminMotion></main>
      </div>
    </div>
  );
}
