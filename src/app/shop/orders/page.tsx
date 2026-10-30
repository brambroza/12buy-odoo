import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { baht } from '@/lib/shop/catalog';
import { getSessionId } from '@/lib/shop/session';
import { listOrders } from '@/lib/shop/store';
import { canPayCredit, creditPayments, pendingCreditPayments } from '@/lib/shop/credit-payment';
import { ORDER_STATUS_LABELS } from '@/lib/shop/types';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PREPARING: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SHIPPED: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  INVOICED: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  PAID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-destructive/15 text-destructive',
};

/** Dealer order list. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sid = await getSessionId();
  const orders = await listOrders(sid);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-lg font-bold">ออเดอร์ของร้าน</h1>
      {error && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">{error}</p>}
      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีออเดอร์</p>
      ) : (
        orders.map((order) => (
          <Link key={order.id} href={`/shop/orders/${order.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{order.ref}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[order.status])}>{ORDER_STATUS_LABELS[order.status]}</span>
                {order.status === 'PENDING' && order.paymentMethod === 'CASH' && !order.payment.slipFile && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">รอแนบสลิป</span>}
                {pendingCreditPayments(order).length > 0
                  ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">แจ้งโอนแล้ว รอตรวจ</span>
                  : creditPayments(order).some((p) => p.status === 'REJECTED') && canPayCredit(order)
                    ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">สลิปไม่ผ่าน ส่งใหม่</span>
                    : canPayCredit(order) && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400">ชำระได้</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(order.createdAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })} · {order.lines.reduce((s, l) => s + l.qty, 0)} เส้น · {baht(order.total)}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))
      )}
    </div>
  );
}
