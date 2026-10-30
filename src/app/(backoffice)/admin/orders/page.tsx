import Link from 'next/link';
import type { ReactNode } from 'react';
import { Ban, CheckCircle2, Eye, FileText, RefreshCw, Truck, UploadCloud, Wallet, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, FilterChip, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { IconSubmit } from '@/components/admin/icon-submit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { creditDues } from '@/lib/admin/dashboard';
import { uniformCashPercent } from '@/lib/shop/pricing';
import { baht } from '@/lib/shop/catalog';
import { canSyncOrder } from '@/lib/shop/odoo-sync';
import { getPendingOrderCredit } from '@/lib/shop/credit-line';
import { creditOutstanding, creditPayments, pendingCreditPayments } from '@/lib/shop/credit-payment';
import { creditPaymentsToResend } from '@/lib/shop/credit-payment-odoo';
import { formatAmount } from '@/lib/money';
import type { OrderCreditView } from '@/lib/shop/credit';
import { countStalePending, isPaymentReady, listAllOrders } from '@/lib/shop/store';
import { CREDIT_PAYMENT_STATUS_LABELS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, type CreditPayment, type CreditPaymentStatus, type OdooSync, type OrderStatus, type ProtoOrder } from '@/lib/shop/types';
import { cn } from '@/lib/utils';
import { adminAdvanceOrderAction, adminCancelOrderAction, adminRefreshStatusesAction, adminSetTrackingAction, adminSyncOrderAction, resendCreditPaymentLogAction, reviewCreditPaymentAction, verifySlipAction } from '../actions';

const STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700', PREPARING: 'bg-blue-500/15 text-blue-700', SHIPPED: 'bg-violet-500/15 text-violet-700',
  INVOICED: 'bg-sky-500/15 text-sky-700', PAID: 'bg-emerald-500/15 text-emerald-700', CANCELLED: 'bg-destructive/15 text-destructive',
};
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { PENDING: 'ยืนยันออเดอร์', PREPARING: 'ส่งของแล้ว', SHIPPED: 'วางบิลแล้ว', INVOICED: 'รับชำระแล้ว' };
/** Row icon for the next manual status step. */
const NEXT_ICON: Partial<Record<OrderStatus, ReactNode>> = { PENDING: <CheckCircle2 />, PREPARING: <Truck />, SHIPPED: <FileText />, INVOICED: <Wallet /> };
const STATUSES = ['PENDING', ...ORDER_STATUS_FLOW.slice(1), 'CANCELLED'] as OrderStatus[];
const CANCEL_CONFIRM = 'ยืนยันยกเลิกออเดอร์นี้? ยกเลิกแล้วย้อนกลับไม่ได้';
const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

type Search = { q?: string; status?: string; page?: string; open?: string; error?: string; info?: string; due?: string; pay?: string };

const CREDIT_PAYMENT_STYLE: Record<CreditPaymentStatus, string> = { PENDING: 'bg-amber-500/15 text-amber-700', VERIFIED: 'bg-emerald-500/15 text-emerald-700', REJECTED: 'bg-destructive/15 text-destructive' };

/** `?due=` filter: credit orders with an unpaid invoice overdue, due soon, or either. */
const DUE_FILTERS = { overdue: 'เลยกำหนดชำระ', soon: 'ใกล้ครบกำหนด', all: 'ครบกำหนดทั้งหมด' } as const;
type DueFilter = keyof typeof DUE_FILTERS;

/** Odoo push status: SO number linking to Odoo, or what went wrong. */
function OdooStatus({ sync }: { sync: OdooSync }) {
  const base = process.env.ODOO_URL;
  const so = sync.saleOrderName && (base && sync.saleOrderId
    ? <a href={`${base}/odoo/sales/${sync.saleOrderId}`} target="_blank" rel="noreferrer" className="underline">{sync.saleOrderName}</a>
    : sync.saleOrderName);
  if (sync.status === 'FAILED') return <span className="text-xs text-destructive">ส่ง Odoo ไม่สำเร็จ: {sync.error}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {sync.status === 'SYNCED'
        ? <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">Odoo {so}</Badge>
        : <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-800">Odoo {so} ยอดไม่ตรง ({baht(sync.amountTotal ?? 0)})</Badge>}
      <InvoiceStatus sync={sync} />
    </span>
  );
}

/** Draft invoice made with the SO: link to it in Odoo, or why it is missing. Nothing for orders sent before invoices were made. */
function InvoiceStatus({ sync }: { sync: OdooSync }) {
  if (sync.invoiceError) return <span className="text-xs text-destructive">ใบแจ้งหนี้ร่างไม่สำเร็จ: {sync.invoiceError}</span>;
  if (!sync.invoice) return null;
  const base = process.env.ODOO_URL;
  const label = sync.invoice.name ?? (sync.invoice.state === 'draft' ? 'ใบแจ้งหนี้ร่าง' : 'ใบแจ้งหนี้');
  return (
    <Badge variant="outline" className="border-transparent bg-sky-500/15 text-sky-700">
      {base ? <a href={`${base}/odoo/account.move/${sync.invoice.id}`} target="_blank" rel="noreferrer" className="underline">{label}</a> : label}
    </Badge>
  );
}

/** Workflow facts for one order: whether Odoo now drives it and the next manual step (if any). */
function orderFlow(o: ProtoOrder) {
  // Once the SO exists in Odoo, delivery/invoice/payment come from Odoo; manual steps are only a fallback.
  const linked = Boolean(o.odoo?.saleOrderId) && o.status !== 'PENDING';
  const next = linked ? undefined : NEXT_LABEL[o.status];
  return { linked, next, cancellable: o.status === 'PENDING' || o.status === 'PREPARING', blocked: o.status === 'PENDING' && !isPaymentReady(o) };
}

/** Slip state of a pending cash order, or of transfers reported on a credit order, as a short badge; null when not relevant. */
function SlipBadge({ order: o }: { order: ProtoOrder }) {
  const creditPending = pendingCreditPayments(o).length;
  if (creditPending) return <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700">แจ้งโอน {creditPending} รายการ รอตรวจ</Badge>;
  if (o.status !== 'PENDING' || o.paymentMethod !== 'CASH') return null;
  if (!o.payment.slipFile) return <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">รอสลิป</Badge>;
  if (!o.payment.verifiedAt) return <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700">รอตรวจสลิป</Badge>;
  return <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">ตรวจสลิปแล้ว</Badge>;
}

/** Total with the end-of-bill cash discount and coupon lines underneath. */
function OrderTotal({ order: o }: { order: ProtoOrder }) {
  return (
    <span className="font-bold tabular-nums">
      {baht(o.total)}
      {o.cashDiscount > 0 && <span className="block text-xs font-normal text-emerald-700">ลดเงินสดท้ายบิล{percentLabel(o.lines)} −{baht(o.cashDiscount)} จาก {baht(o.subtotal)}</span>}
      {o.coupon && o.couponDiscount > 0 && <span className="block text-xs font-normal text-emerald-700">คูปอง {o.coupon.code} −{baht(o.couponDiscount)}</span>}
    </span>
  );
}

/** Admin inbox for web orders: searchable, paged table with quick status moves; details and forms in a drawer. */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const status = STATUSES.includes(params.status as OrderStatus) ? (params.status as OrderStatus) : undefined;
  const [all, pendingOld] = await Promise.all([listAllOrders(), countStalePending(2 * 60 * 60 * 1000)]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((o) => o.status === s).length])) as Record<OrderStatus, number>;
  const due = params.due && params.due in DUE_FILTERS ? (params.due as DueFilter) : undefined;
  const dues = creditDues(all);
  const dueIds = (filter: DueFilter) => new Set(dues.filter((d) => filter === 'all' || (filter === 'overdue') === (d.daysLeft < 0)).map((d) => d.orderId));
  const dueMatch = due ? dueIds(due) : null;
  // `?pay=pending`: credit orders with a dealer-reported transfer nobody has checked yet.
  const payPending = params.pay === 'pending';
  const payPendingCount = all.filter((o) => o.status !== 'CANCELLED' && pendingCreditPayments(o).length > 0).length;
  const q = searchText(params.q);
  const orders = all.filter((o) => (!status || o.status === status) && (!dueMatch || dueMatch.has(o.id)) && (!payPending || pendingCreditPayments(o).length > 0)
    && matchesSearch(q, o.ref, o.dealerName, o.poRef, o.carrier, o.trackingRef, o.odoo?.saleOrderName, ...o.lines.flatMap((l) => [l.code, l.size, l.name])));
  const pageRows = paginate(orders, params.page);

  /** List URL with the current filters; `changes` overrides params such as `status`, `open` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) =>
    listHref('/admin/orders', { q: params.q, status, due, pay: payPending ? 'pending' : undefined, page: params.page }, changes);
  const filterHref = (next: OrderStatus | undefined) => href({ status: next, page: undefined });
  const closeHref = href();
  const openOrder = params.open ? all.find((o) => o.id === params.open) : undefined;

  const notice = (
    <>
      {params.info && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800">{params.info}</p>}
      {params.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{params.error}</p>}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ออเดอร์จากเว็บ</h1>
          <p className="text-sm text-muted-foreground">ยืนยันออเดอร์ (เงินสดหลังตรวจสลิป / เครดิตกดได้ทันที) = สร้างและยืนยันใบสั่งขาย (SO) พร้อมใบแจ้งหนี้ร่างใน Odoo อัตโนมัติ · หลังจากนั้นสถานะจัดส่ง/วางบิล/ชำระเงินตามที่คลังและบัญชีทำใน Odoo (ดึงอัตโนมัติทุกไม่กี่นาที)</p>
        </div>
        <form action={adminRefreshStatusesAction}><Button type="submit" size="sm" variant="outline"><RefreshCw /> ดึงสถานะจาก Odoo ตอนนี้</Button></form>
      </div>
      {!openOrder && notice}
      {pendingOld > 0 && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">มี {pendingOld} ออเดอร์รอยืนยันเกิน 2 ชั่วโมง</p>}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip href={filterHref(undefined)} active={!status}>ทั้งหมด {all.length}</FilterChip>
        {STATUSES.map((s) => <FilterChip key={s} href={filterHref(status === s ? undefined : s)} active={status === s}>{ORDER_STATUS_LABELS[s]} {counts[s]}</FilterChip>)}
        {(['overdue', 'soon'] as const).map((f) => {
          const n = dueIds(f).size;
          return (n > 0 || due === f) && <FilterChip key={f} href={href({ due: due === f ? undefined : f, page: undefined })} active={due === f}>{DUE_FILTERS[f]} {n}</FilterChip>;
        })}
        {due === 'all' && <FilterChip href={href({ due: undefined, page: undefined })} active>{DUE_FILTERS.all} {dueIds('all').size}</FilterChip>}
        {(payPendingCount > 0 || payPending) && <FilterChip href={href({ pay: payPending ? undefined : 'pending', page: undefined })} active={payPending}>แจ้งโอนเครดิต รอตรวจ {payPendingCount}</FilterChip>}
        <div className="w-full sm:ml-auto sm:w-auto">
          <ListSearch action="/admin/orders" q={params.q} placeholder="ค้นเลขออเดอร์ / ร้าน / PO / ขนาดยาง / SO" keep={{ status, due }}
            clearHref={params.q ? listHref('/admin/orders', { status, due, pay: payPending ? 'pending' : undefined }) : undefined} />
        </div>
      </div>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>ออเดอร์</TableHead>
              <TableHead>ร้าน</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>การจัดส่ง</TableHead>
              <TableHead>Odoo</TableHead>
              <TableHead className="text-right">ยอด</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {all.length === 0 && <EmptyRow colSpan={7}>ยังไม่มีออเดอร์ — ลองสั่งจาก <Link href="/shop" className="text-primary">หน้าดีลเลอร์</Link></EmptyRow>}
            {all.length > 0 && orders.length === 0 && <EmptyRow colSpan={7}>ไม่พบออเดอร์ตามเงื่อนไข</EmptyRow>}
            {pageRows.items.map((o) => {
              const { next, cancellable, blocked } = orderFlow(o);
              const openHref = href({ open: o.id });
              return (
                <TableRow key={o.id} data-state={params.open === o.id ? 'selected' : undefined}>
                  <TableCell data-label="ออเดอร์">
                    <Link href={openHref} scroll={false} className="block hover:underline">
                      <span className="block font-medium">{o.ref}</span>
                      <span className="block text-xs text-muted-foreground">{dateTime(o.createdAt)} · {o.lines.length} รายการ</span>
                    </Link>
                  </TableCell>
                  <TableCell data-label="ร้าน">
                    <span className="block">{o.dealerName}</span>
                    {o.poRef && <span className="block text-xs text-muted-foreground">PO ร้าน: {o.poRef}</span>}
                  </TableCell>
                  <TableCell data-label="สถานะ">
                    <span className="flex flex-wrap gap-1">
                      <Badge variant="outline" className={cn('border-transparent', STYLE[o.status])}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                      <Badge variant="outline" className={cn('border-transparent', o.paymentMethod === 'CREDIT' ? 'bg-sky-500/15 text-sky-700' : 'bg-muted text-foreground')}>{o.paymentMethod === 'CREDIT' ? 'เครดิต' : 'เงินสด'}</Badge>
                      <SlipBadge order={o} />
                    </span>
                  </TableCell>
                  <TableCell data-label="การจัดส่ง">
                    <span className="block text-xs">{o.carrier}</span>
                    {o.trackingRef && <span className="block text-xs text-muted-foreground">เลขพัสดุ {o.trackingRef}</span>}
                  </TableCell>
                  <TableCell data-label="Odoo">{o.odoo ? <OdooStatus sync={o.odoo} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell data-label="ยอด" className="text-right"><OrderTotal order={o} /></TableCell>
                  <TableCell data-label="">
                    <span className="flex justify-end gap-1">
                      <IconLink href={openHref} label="ดูรายละเอียด"><Eye /></IconLink>
                      {next && (
                        <form action={adminAdvanceOrderAction}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <input type="hidden" name="expectedStatus" value={o.status} />
                          <IconSubmit label={blocked ? `${next} (ต้องตรวจสลิปก่อน)` : o.status === 'PENDING' ? `${next} · สร้าง SO + ใบแจ้งหนี้ร่างใน Odoo` : next} tone="primary" disabled={blocked}>{NEXT_ICON[o.status]}</IconSubmit>
                        </form>
                      )}
                      {canSyncOrder(o) && (
                        <form action={adminSyncOrderAction}><input type="hidden" name="orderId" value={o.id} /><IconSubmit label={o.odoo ? 'ส่งเข้า Odoo อีกครั้ง' : 'ส่งเข้า Odoo'}><UploadCloud /></IconSubmit></form>
                      )}
                      {cancellable && (
                        <form action={adminCancelOrderAction}><input type="hidden" name="orderId" value={o.id} /><IconSubmit label="ยกเลิก" tone="danger" confirm={`${o.ref}: ${CANCEL_CONFIRM}`}><Ban /></IconSubmit></form>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: String(n) })} unit="ออเดอร์" />

      {openOrder && <OrderDrawer key={openOrder.id} order={openOrder} closeHref={closeHref} notice={notice} />}
    </div>
  );
}

/** Drawer with the full order: lines, address, slip check, status / tracking / Odoo forms and history. */
function OrderDrawer({ order: o, closeHref, notice }: { order: ProtoOrder; closeHref: string; notice: ReactNode }) {
  const { linked, next, cancellable, blocked } = orderFlow(o);
  const progress = o.odoo?.progress;
  return (
    <UrlDrawer
      title={<span className="flex flex-wrap items-center gap-2">{o.ref}<Badge variant="outline" className={cn('border-transparent', STYLE[o.status])}>{ORDER_STATUS_LABELS[o.status]}</Badge></span>}
      description={`${o.dealerName} · ${dateTime(o.createdAt)} · ${o.carrier}`}
      closeHref={closeHref}
      size="lg"
    >
      {notice}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline" className={cn('border-transparent', o.paymentMethod === 'CREDIT' ? 'bg-sky-500/15 text-sky-700' : 'bg-muted text-foreground')}>{o.paymentMethod === 'CREDIT' ? 'เครดิต' : 'เงินสด'}</Badge>
        {o.poRef && <span className="text-xs text-muted-foreground">PO ร้าน: {o.poRef}</span>}
        {o.odoo && <OdooStatus sync={o.odoo} />}
        <span className="ml-auto text-right"><OrderTotal order={o} /></span>
      </div>

      <section className="rounded-lg border border-border">
        <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">รายการสินค้า</h2>
        <div className="rt"><Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>สินค้า</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              <TableHead className="text-right">ราคา/หน่วย</TableHead>
              <TableHead className="text-right">รวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.lines.map((l) => (
              <TableRow key={l.productId}>
                <TableCell data-label="สินค้า">
                  <span className="block font-medium">{l.size ?? l.code}</span>
                  <span className="block text-xs text-muted-foreground">{l.code}{l.name && l.name !== l.code ? ` · ${l.name}` : ''}</span>
                </TableCell>
                <TableCell data-label="จำนวน" className="text-right tabular-nums">{l.qty}{l.unitName && l.unitQty ? <span className="block text-xs text-muted-foreground">{l.qty / l.unitQty} {l.unitName}</span> : null}</TableCell>
                <TableCell data-label="ราคา/หน่วย" className="text-right tabular-nums">{baht(l.unitPrice)}</TableCell>
                <TableCell data-label="รวม" className="text-right tabular-nums">{baht(l.unitPrice * l.qty)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div>
      </section>

      <section className="space-y-1 text-sm">
        <p><span className="text-muted-foreground">ที่อยู่จัดส่ง:</span> {o.address || '—'}</p>
        <p><span className="text-muted-foreground">การจัดส่ง:</span> {o.carrier}{!linked && o.trackingRef ? ` · เลขพัสดุ ${o.trackingRef}` : ''}</p>
        {o.note && <p className="text-xs">หมายเหตุ: {o.note}</p>}
      </section>

      {o.status === 'PENDING' && o.paymentMethod === 'CASH' && (
        <section className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-xs">
          {o.payment.slipFile ? (
            <>
              <a href={`/api/proto/uploads/${o.payment.slipFile}`} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/proto/uploads/${o.payment.slipFile}`} alt="สลิป" className="h-40 rounded border border-border object-contain" />
              </a>
              <div className="space-y-2">
                <p>สลิปส่งเมื่อ {dateTime(o.payment.slipUploadedAt!)} · ยอดที่ต้องได้รับ <b>{baht(o.total)}</b></p>
                {o.payment.verifiedAt ? (
                  <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">ตรวจสลิปแล้ว</Badge>
                ) : (
                  <form action={verifySlipAction}><input type="hidden" name="orderId" value={o.id} /><Button type="submit" size="sm" variant="outline">ตรวจสลิปแล้ว ยอดถูกต้อง</Button></form>
                )}
              </div>
            </>
          ) : (
            <span className="text-amber-700">รอดีลเลอร์แนบสลิป · ยืนยันออเดอร์ได้หลังตรวจสลิป</span>
          )}
        </section>
      )}

      {o.status === 'PENDING' && o.paymentMethod === 'CREDIT' && (
        <section className="space-y-3 rounded-lg bg-sky-500/10 p-3 text-xs text-sky-900">
          <CreditPanel order={o} />
        </section>
      )}

      {o.paymentMethod === 'CREDIT' && creditPayments(o).length > 0 && <CreditPaymentsSection order={o} />}

      <section className="flex flex-wrap items-center gap-2">
        {next && (
          <form action={adminAdvanceOrderAction} className="flex items-center gap-2">
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="expectedStatus" value={o.status} />
            {o.status === 'PREPARING' && <Input name="trackingRef" placeholder="เลขพัสดุ (ถ้ามี)" className="h-8 w-40" />}
            <Button type="submit" size="sm" disabled={blocked}>{o.status === 'PENDING' ? <><CheckCircle2 /> {next} · สร้าง SO + ใบแจ้งหนี้ร่างใน Odoo</> : next}</Button>
          </form>
        )}
        {cancellable && (
          <form action={adminCancelOrderAction}>
            <input type="hidden" name="orderId" value={o.id} />
            <IconSubmit label="ยกเลิก" tone="danger" confirm={`${o.ref}: ${CANCEL_CONFIRM}`} className="w-auto gap-1.5 px-2.5"><Ban /> ยกเลิก</IconSubmit>
          </form>
        )}
        {linked && ['PREPARING', 'SHIPPED'].includes(o.status) && (
          <form action={adminSetTrackingAction} className="flex items-center gap-2">
            <input type="hidden" name="orderId" value={o.id} />
            <Input name="trackingRef" defaultValue={o.trackingRef ?? ''} placeholder="เลขพัสดุ (ถ้ามี)" className="h-8 w-40" />
            <Button type="submit" size="sm" variant="outline">บันทึกเลขพัสดุ</Button>
          </form>
        )}
        {canSyncOrder(o) && (
          <form action={adminSyncOrderAction}><input type="hidden" name="orderId" value={o.id} /><Button type="submit" size="sm" variant="outline">{o.odoo?.invoiceError ? 'สร้างใบแจ้งหนี้ร่างอีกครั้ง' : o.odoo ? 'ส่งเข้า Odoo อีกครั้ง' : 'ส่งเข้า Odoo'}</Button></form>
        )}
      </section>
      {progress && (
        <p className="text-xs text-muted-foreground">
          Odoo: จัดส่ง {progress.deliveryStatus === 'full' ? 'ครบ' : progress.deliveryStatus === 'partial' ? 'บางส่วน' : 'ยังไม่ส่ง'}
          {progress.invoices.length ? ` · ใบแจ้งหนี้ ${progress.invoices.map((i) => i.name).join(', ')}` : ''}
          {' · '}ตรวจ {dateTime(progress.checkedAt)}
        </p>
      )}

      {o.events.length > 0 && (
        <section className="rounded-lg border border-border">
          <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">ประวัติสถานะ</h2>
          <ul className="divide-y divide-border text-xs">
            {o.events.map((e, i) => (
              <li key={`${e.status}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>{ORDER_STATUS_LABELS[e.status]}</span>
                <span className="text-muted-foreground">{dateTime(e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </UrlDrawer>
  );
}

/**
 * Transfers the dealer reported on a credit order: slip, amount, remark, review buttons for pending ones,
 * and whether the chatter note reached Odoo (with a resend button when it did not).
 */
function CreditPaymentsSection({ order: o }: { order: ProtoOrder }) {
  const payments = [...creditPayments(o)].reverse();
  const outstanding = creditOutstanding(o);
  const toResend = creditPaymentsToResend(o);
  const base = process.env.ODOO_URL;
  return (
    <section className="rounded-lg border border-sky-500/30">
      <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm font-semibold">
        <span>ดีลเลอร์แจ้งโอนชำระ (เครดิต)</span>
        <span className="text-xs font-normal text-muted-foreground">ค้างชำระ {o.status === 'PAID' ? '0' : formatAmount(outstanding)} บาท{o.odoo?.progress?.invoices.length ? ' (จากใบแจ้งหนี้ Odoo)' : ''}</span>
      </h2>
      <ul className="divide-y divide-border">
        {payments.map((p) => <CreditPaymentRow key={p.id} order={o} payment={p} odooBase={base} />)}
      </ul>
      {toResend.length > 0 && (
        <form action={resendCreditPaymentLogAction} className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          <input type="hidden" name="orderId" value={o.id} />
          <span>{toResend.length} รายการยังไม่ได้บันทึกเข้า Odoo chatter</span>
          <Button type="submit" size="sm" variant="outline"><UploadCloud /> ส่ง log เข้า Odoo อีกครั้ง</Button>
        </form>
      )}
      {!o.odoo?.saleOrderId && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">ออเดอร์นี้ยังไม่มี SO ใน Odoo จึงบันทึก chatter ไม่ได้</p>}
    </section>
  );
}

/** One reported transfer with its slip, amount check against what is owed, review forms and Odoo note state. */
function CreditPaymentRow({ order: o, payment: p, odooBase }: { order: ProtoOrder; payment: CreditPayment; odooBase?: string }) {
  const outstanding = creditOutstanding(o);
  const over = p.status === 'PENDING' && outstanding > 0 && p.amount > outstanding + 0.005;
  return (
    <li className="flex flex-wrap items-start gap-3 p-3 text-xs">
      <a href={`/api/proto/uploads/${p.slipFile}`} target="_blank" rel="noreferrer" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/proto/uploads/${p.slipFile}`} alt="สลิป" className="h-32 rounded border border-border object-contain" />
      </a>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-center gap-2">
          <b className="text-sm">{formatAmount(p.amount)} บาท</b>
          <Badge variant="outline" className={cn('border-transparent', CREDIT_PAYMENT_STYLE[p.status])}>{CREDIT_PAYMENT_STATUS_LABELS[p.status]}</Badge>
          {over && <span className="text-amber-700">ยอดแจ้งมากกว่ายอดค้าง {formatAmount(outstanding)} บาท</span>}
        </p>
        <p className="text-muted-foreground">แจ้งเมื่อ {dateTime(p.uploadedAt)}{p.reviewedAt ? ` · ตรวจเมื่อ ${dateTime(p.reviewedAt)}` : ''}</p>
        {p.note && <p>หมายเหตุจากร้าน: {p.note}</p>}
        {p.status === 'REJECTED' && p.rejectReason && <p className="text-destructive">เหตุผล: {p.rejectReason}</p>}
        <p className={cn(p.odoo?.error ? 'text-destructive' : 'text-muted-foreground')}>
          {!p.odoo ? 'ยังไม่ได้บันทึกเข้า Odoo' : p.odoo.error ? `บันทึกเข้า Odoo ไม่สำเร็จ: ${p.odoo.error}` : (
            <>บันทึกเข้า Odoo chatter แล้ว {dateTime(p.odoo.at)}{odooBase && o.odoo?.saleOrderId ? <> · <a href={`${odooBase}/odoo/sales/${o.odoo.saleOrderId}`} target="_blank" rel="noreferrer" className="underline">เปิด SO</a></> : null}{p.odoo.invoiceMessageId && odooBase && o.odoo?.invoice ? <> · <a href={`${odooBase}/odoo/account.move/${o.odoo.invoice.id}`} target="_blank" rel="noreferrer" className="underline">ใบแจ้งหนี้</a></> : null}</>
          )}
        </p>
        {p.status === 'PENDING' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <form action={reviewCreditPaymentAction}>
              <input type="hidden" name="orderId" value={o.id} />
              <input type="hidden" name="paymentId" value={p.id} />
              <input type="hidden" name="decision" value="VERIFIED" />
              <Button type="submit" size="sm"><CheckCircle2 /> ตรวจแล้ว เงินเข้าถูกต้อง</Button>
            </form>
            <form action={reviewCreditPaymentAction} className="flex items-center gap-1">
              <input type="hidden" name="orderId" value={o.id} />
              <input type="hidden" name="paymentId" value={p.id} />
              <input type="hidden" name="decision" value="REJECTED" />
              <Input name="reason" placeholder="เหตุผลที่ไม่ผ่าน (จำเป็น)" required className="h-8 w-44" />
              <IconSubmit label="ปฏิเสธสลิป" tone="danger" confirm={`${o.ref}: ปฏิเสธสลิปรายการนี้? ร้านจะต้องส่งใหม่`}><XCircle /></IconSubmit>
            </form>
          </div>
        )}
        {p.status === 'VERIFIED' && o.status !== 'PAID' && <p className="text-emerald-700">บัญชีลงรับชำระ (Register Payment) ในใบแจ้งหนี้ Odoo แล้วสถานะจะเป็น “ชำระแล้ว” อัตโนมัติ</p>}
      </div>
    </li>
  );
}

/** Remaining credit of the dealer behind a pending credit order: web line and Odoo partner limit, before and after this order. */
async function CreditPanel({ order: o }: { order: ProtoOrder }) {
  const credit = await getPendingOrderCredit(o);
  if (!credit) return <p className="text-muted-foreground">ไม่พบข้อมูลวงเงินของลูกค้ารายนี้</p>;
  const { web, odoo, odooError } = credit;
  return (
    <div className="grid gap-2 sm:grid-cols-1">
      <CreditCard title="วงเงินเครดิต" view={web} usedLabel="ยอดยกมา + ออเดอร์เครดิตค้าง" empty="ไม่ได้ตั้งวงเงินบนเว็บ" />
     {(web?.over || odoo?.over) && (
        <p className="rounded-md bg-destructive/10 p-2 text-destructive sm:col-span-2">ออเดอร์นี้เกินวงเงินเครดิต · ตรวจสอบกับฝ่ายขาย/บัญชีก่อนยืนยัน</p>
      )}
    </div>
  );
}

/** One credit line: limit, used, room left now and after confirming the order. */
function CreditCard({ title, view, usedLabel, empty }: { title: string; view: OrderCreditView | null; usedLabel: string; empty: string }) {
  return (
    <div className="rounded-md border border-sky-500/20 bg-background p-2 text-foreground">
      <p className="mb-1 font-semibold">{title}</p>
      {view ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
          <dt className="text-muted-foreground">วงเงิน</dt><dd className="text-right">{baht(view.limit)}</dd>
          <dt className="text-muted-foreground">{usedLabel}</dt><dd className="text-right">{baht(view.used)}</dd>
          <dt className="text-muted-foreground">คงเหลือก่อนออเดอร์นี้</dt><dd className="text-right">{baht(view.before)}</dd>
          <dt className="font-medium">คงเหลือหลังยืนยัน</dt>
          <dd className={cn('text-right font-bold', view.over ? 'text-destructive' : 'text-emerald-700')}>{baht(view.after)}</dd>
        </dl>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/** " 2%" when every cash-discounted line has the same %, else empty. */
function percentLabel(lines: Parameters<typeof uniformCashPercent>[0]): string {
  const percent = uniformCashPercent(lines);
  return percent !== null ? ` ${percent}%` : '';
}
