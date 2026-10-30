'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const POLL_MS = 60_000;

type Item = { id: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string };
type Data = { unread: number; items: Item[] };

async function fetchBell(): Promise<Data | null> {
  try {
    const res = await fetch('/api/shop/notifications', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as Data) : null;
  } catch {
    return null;
  }
}

/** Dealer header bell: unread badge and the latest notifications; polls every minute while visible. */
export function ShopNotificationBell() {
  const pathname = usePathname();
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => fetchBell().then((next) => { if (next) setData(next); }), []);

  useEffect(() => { void load(); }, [load, pathname]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  const unread = data?.unread ?? 0;
  const label = unread ? `การแจ้งเตือน ${unread} รายการใหม่` : 'การแจ้งเตือน';
  return (
    <Popover>
      <PopoverTrigger render={
        <button type="button" aria-label={label} title={label} className="relative flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground">
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-primary-foreground">{unread > 99 ? '99+' : unread}</span>}
        </button>
      } />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-semibold">การแจ้งเตือน <Link href="/shop/notifications" className="text-xs font-normal text-primary">ดูทั้งหมด</Link></div>
        <ul className="max-h-80 divide-y divide-border overflow-auto text-sm">
          {!data ? <li className="p-3 text-muted-foreground">กำลังโหลด…</li>
            : data.items.length === 0 ? <li className="p-3 text-muted-foreground">ยังไม่มีการแจ้งเตือน</li>
            : data.items.map((n) => (
              <li key={n.id} className={cn(!n.readAt && 'bg-primary/5')}>
                <Link href={n.href ?? '/shop/notifications'} className="block px-3 py-2 hover:bg-muted">
                  <p className={cn('truncate', !n.readAt ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                </Link>
              </li>
            ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
