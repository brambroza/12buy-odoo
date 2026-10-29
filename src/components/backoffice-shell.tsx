'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LayoutDashboard, FileText, Users, Package, Menu, MapPinned, Tags, Store, Inbox, Smartphone, UserPlus, ShieldCheck, LogOut, UsersRound, TicketPercent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ROLE_LABELS, isAdminRole, type Role } from '@/lib/auth/roles';
import { logoutAction } from '@/app/login/actions';
import { BrandLogo } from '@/components/landing/brand-logo';

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; group?: string; adminOnly?: boolean }[] = [
  { href: '/admin/orders', label: 'ออเดอร์จากเว็บ', icon: Inbox, group: 'ดีลเลอร์' },
  { href: '/admin/dealers', label: 'ดีลเลอร์', icon: Store },
  { href: '/admin/leads', label: 'ใบสมัครดีลเลอร์', icon: UserPlus },
  { href: '/admin/groups', label: 'กลุ่มลูกค้า', icon: UsersRound, adminOnly: true },
  { href: '/admin/zones', label: 'โซนราคา', icon: MapPinned, adminOnly: true },
  { href: '/admin/prices', label: 'ตารางราคา', icon: Tags, adminOnly: true },
  { href: '/admin/coupons', label: 'คูปอง', icon: TicketPercent, adminOnly: true },
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
        const active = pathname.startsWith(item.href);
        const link = (
          <Link key={item.href} href={item.href} onClick={onNavigate} className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
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

/** Sidebar + top bar for staff pages. Rendered by the `(backoffice)` layout after the session check. */
export function BackofficeShell({ user, children }: { user: { name: string; role: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const role = user.role as Role;
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card p-4 md:flex md:flex-col md:gap-6">
        <Brand />
        <NavLinks pathname={pathname} role={role} />
        <UserBox user={{ name: user.name, role }} />
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden"><Menu className="size-5" /></Button>} />
            <SheetContent side="left" className="flex w-64 flex-col p-4">
              <SheetTitle className="sr-only">เมนู</SheetTitle>
              <Brand />
              <div className="mt-6 flex flex-1 flex-col"><NavLinks pathname={pathname} role={role} onNavigate={() => setOpen(false)} /><UserBox user={{ name: user.name, role }} /></div>
            </SheetContent>
          </Sheet>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground md:hidden"><BrandLogo size={28} /> 12buy Admin</p>
          <p className="ml-auto hidden text-xs text-muted-foreground md:block">{user.name} · {ROLE_LABELS[role]}</p>
        </header>
        <main className="flex-1 bg-muted/30 p-4 md:p-8"><div className="mx-auto w-full max-w-6xl">{children}</div></main>
      </div>
    </div>
  );
}
