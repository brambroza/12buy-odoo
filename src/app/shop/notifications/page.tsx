import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requireDealerAccess } from '@/lib/auth/session';
import { listNotifications } from '@/lib/notify/repo';
import { cn } from '@/lib/utils';
import { markAllNotificationsReadAction, markNotificationReadAction } from './actions';

export const metadata: Metadata = { title: 'การแจ้งเตือน' };

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/** Dealer inbox: every notification of the shop, newest first, with read state. */
export default async function NotificationsPage() {
  const user = await requireDealerAccess();
  const items = user.dealerId ? await listNotifications({ dealerId: user.dealerId }, 100) : [];
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold"><Bell className="size-5" /> การแจ้งเตือน {unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{unread}</span>}</h1>
        {unread > 0 && <form action={markAllNotificationsReadAction}><Button type="submit" size="sm" variant="outline"><CheckCheck className="size-4" /> อ่านทั้งหมดแล้ว</Button></form>}
      </div>
      {!user.dealerId ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">มุมมองแอดมินไม่มีกล่องแจ้งเตือนของร้าน</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน เมื่อสถานะออเดอร์เปลี่ยนจะแสดงที่นี่ และส่งเข้า LINE หากเชื่อมบัญชีไว้</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((n) => (
            <li key={n.id} className={cn('flex items-start gap-3 p-3 text-sm', !n.readAt && 'bg-primary/5')}>
              <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={cn('font-medium', !n.readAt && 'font-semibold')}>{n.title}</p>
                <p className="text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fmt.format(new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(n.createdAt) ? n.createdAt : `${n.createdAt}Z`))}</p>
              </div>
              {n.href && (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="href" value={n.href} />
                  <button type="submit" className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground" aria-label="เปิด"><ChevronRight className="size-4" /></button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">อยากได้แจ้งเตือนใน LINE? <Link href="/shop/account#line" className="text-primary underline">เชื่อม LINE ที่หน้าข้อมูลร้าน</Link></p>
    </div>
  );
}
