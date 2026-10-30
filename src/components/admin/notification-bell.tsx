'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { BellData } from '@/lib/admin/notifications';
import type { TaskPriority } from '@/lib/admin/dashboard';
import { cn } from '@/lib/utils';

/** How often the bell re-checks while the tab is visible. */
const POLL_MS = 60_000;

const DOT: Record<TaskPriority, string> = { urgent: 'bg-destructive', today: 'bg-amber-500', soon: 'bg-sky-500' };
const LABEL: Record<TaskPriority, string> = { urgent: 'ด่วน', today: 'วันนี้', soon: 'ติดตาม' };

async function fetchBell(): Promise<BellData | null> {
  try {
    const res = await fetch('/api/admin/notifications', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as BellData) : null;
  } catch {
    return null;
  }
}

/**
 * Top-bar bell with a red count of work waiting (orders to confirm, slips, sign-ups, approvals…).
 * Refreshes on navigation, every minute while visible, and when the tab regains focus.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [data, setData] = useState<BellData | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  /** Fetches fresh numbers; keeps the last ones when offline or the server hiccups. */
  const load = useCallback(() => fetchBell().then((next) => { if (next) setData(next); }), []);

  useEffect(() => { void load(); }, [load, pathname]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  const refresh = () => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  };

  const badge = data?.badge ?? 0;
  const label = badge ? `การแจ้งเตือน ${badge} รายการ` : 'การแจ้งเตือน';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button variant="ghost" size="icon" className="relative" title={label} aria-label={label}>
          <Bell className="size-5" />
          {badge > 0 && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card tabular-nums">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </Button>
      } />
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">งานที่รอดำเนินการ</p>
          <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={loading} title="รีเฟรช" aria-label="รีเฟรช">
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </Button>
        </div>
        {!data ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : data.items.length === 0 ? (
          <p className="flex flex-col items-center gap-1 px-3 py-6 text-center text-sm text-muted-foreground"><CheckCircle2 className="size-6 text-emerald-600" /> ไม่มีงานค้าง</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {data.items.map((item) => (
              <li key={item.id}>
                <Link href={item.href} onClick={() => setOpen(false)} className="flex gap-2.5 px-3 py-2.5 hover:bg-muted">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[item.priority])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{item.title}</span>
                      {item.count > 0 && <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums">{item.count}</span>}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground"><span className="font-medium">{LABEL[item.priority]}</span> · {item.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin" onClick={() => setOpen(false)} className="block border-t border-border px-3 py-2 text-center text-xs font-medium text-primary hover:bg-muted">ดูแดชบอร์ด</Link>
      </PopoverContent>
    </Popover>
  );
}
