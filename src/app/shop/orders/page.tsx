import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Search, X } from 'lucide-react';
import { ListPagination } from '@/components/admin/list-kit';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { baht } from '@/lib/shop/catalog';
import { getSessionId } from '@/lib/shop/session';
import { listOrders } from '@/lib/shop/store';
import { canPayCredit, creditPayments, pendingCreditPayments } from '@/lib/shop/credit-payment';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, type OrderStatus, type ProtoOrder } from '@/lib/shop/types';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'ออเดอร์ของร้าน' };

const PATH = '/shop/orders';
const PAGE_SIZE = 20;

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PREPARING: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SHIPPED: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  INVOICED: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  PAID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-destructive/15 text-destructive',
};

/** `?f=` filter: by status, open (not finished), or awaiting the dealer's payment. */
const FILTERS: { key: string; label: string; match: (o: ProtoOrder) => boolean }[] = [
  { key: '', label: 'ทั้งหมด', match: () => true },
  { key: 'open', label: 'กำลังดำเนินการ', match: (o) => o.status !== 'PAID' && o.status !== 'CANCELLED' },
  { key: 'pay', label: 'รอชำระ', match: (o) => (o.status === 'PENDING' && o.paymentMethod === 'CASH' && !o.payment.slipFile) || canPayCredit(o) },
  ...ORDER_STATUS_FLOW.map((status) => ({ key: status.toLowerCase(), label: ORDER_STATUS_LABELS[status], match: (o: ProtoOrder) => o.status === status })),
  { key: 'cancelled', label: ORDER_STATUS_LABELS.CANCELLED, match: (o) => o.status === 'CANCELLED' },
];

/** Five dots showing how far the order is; cancelled orders show a struck line. */
function MiniProgress({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') return <span className="text-[10px] text-destructive line-through">ยกเลิก</span>;
  const current = ORDER_STATUS_FLOW.indexOf(status);
  return (
    <span className="flex items-center gap-1" aria-label={`ขั้นที่ ${current + 1} จาก ${ORDER_STATUS_FLOW.length}`}>
      {ORDER_STATUS_FLOW.map((step, i) => <span key={step} className={cn('h-1.5 w-5 rounded-full', i <= current ? 'bg-primary' : 'bg-border')} />)}
    </span>
  );
}

type Search = { error?: string; f?: string; q?: string; page?: string };

/** Dealer order list with status filters, search (ref, PO, size, SO) and pagination. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const sid = await getSessionId();
  const all = await listOrders(sid);
  const filter = FILTERS.find((f) => f.key === (params.f ?? '')) ?? FILTERS[0];
  const q = searchText(params.q);
  const filtered = all.filter((o) => filter.match(o) && matchesSearch(q, o.ref, o.poRef, o.trackingRef, o.odoo?.saleOrderName, ...o.lines.flatMap((l) => [l.size, l.code, l.name])));
  const page = paginate(filtered, params.page, PAGE_SIZE);
  const href = (changes: Record<string, string | number | undefined>) => listHref(PATH, params, { page: undefined, ...changes });
  const counts = { open: all.filter(FILTERS[1].match).length, pay: all.filter(FILTERS[2].match).length };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">ออเดอร์ของร้าน <span className="text-sm font-normal text-muted-foreground">{all.length} รายการ</span></h1>
        <form action={PATH} role="search" className="flex items-center gap-1">
          {params.f && <input type="hidden" name="f" value={params.f} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" type="search" defaultValue={params.q ?? ''} placeholder="เลขออเดอร์ · PO · ขนาด" aria-label="ค้นหาออเดอร์" className="h-9 w-48 rounded-lg border border-border bg-card pl-8 pr-2 text-sm sm:w-64" />
          </div>
          {q && <Link href={href({ q: undefined })} aria-label="ล้างการค้นหา" className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><X className="size-4" /></Link>}
        </form>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link key={f.key} href={href({ f: f.key || undefined })} aria-current={filter.key === f.key ? 'true' : undefined} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs font-medium', filter.key === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
            {f.label}{f.key === 'open' && counts.open > 0 ? ` ${counts.open}` : ''}{f.key === 'pay' && counts.pay > 0 ? ` ${counts.pay}` : ''}
          </Link>
        ))}
      </div>
      {params.error && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">{params.error}</p>}
      {all.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีออเดอร์ <Link href="/shop/search" className="text-primary underline">เริ่มค้นหาสินค้า</Link></p>
      ) : page.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ไม่พบออเดอร์ตามเงื่อนไขนี้ <Link href={PATH} className="text-primary underline">ดูทั้งหมด</Link></p>
      ) : (
        page.items.map((order) => (
          <Link key={order.id} href={`/shop/orders/${order.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
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
                {new Date(order.createdAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })} · {order.lines.reduce((s, l) => s + l.qty, 0)} หน่วย · {baht(order.total)}{order.poRef ? ` · PO ${order.poRef}` : ''}{order.trackingRef ? ` · พัสดุ ${order.trackingRef}` : ''}
              </p>
              <MiniProgress status={order.status} />
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))
      )}
      {page.total > PAGE_SIZE && <ListPagination page={page} href={(n) => listHref(PATH, params, { page: n })} unit="ออเดอร์" />}
    </div>
  );
}
