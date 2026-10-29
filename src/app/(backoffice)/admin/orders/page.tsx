import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { baht } from '@/lib/shop/catalog';
import { canSyncOrder } from '@/lib/shop/odoo-sync';
import { countStalePending, isPaymentReady, listAllOrders } from '@/lib/shop/store';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, type OdooSync, type OrderStatus } from '@/lib/shop/types';
import { cn } from '@/lib/utils';
import { adminAdvanceOrderAction, adminCancelOrderAction, adminRefreshStatusesAction, adminSetTrackingAction, adminSyncOrderAction, verifySlipAction } from '../actions';

const STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700', PREPARING: 'bg-blue-500/15 text-blue-700', SHIPPED: 'bg-violet-500/15 text-violet-700',
  INVOICED: 'bg-sky-500/15 text-sky-700', PAID: 'bg-emerald-500/15 text-emerald-700', CANCELLED: 'bg-destructive/15 text-destructive',
};
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { PENDING: 'ยืนยันออเดอร์', PREPARING: 'ส่งของแล้ว', SHIPPED: 'วางบิลแล้ว', INVOICED: 'รับชำระแล้ว' };

/** Odoo push status: SO number linking to Odoo, or what went wrong. */
function OdooStatus({ sync }: { sync: OdooSync }) {
  const base = process.env.ODOO_URL;
  const so = sync.saleOrderName && (base && sync.saleOrderId
    ? <a href={`${base}/odoo/sales/${sync.saleOrderId}`} target="_blank" rel="noreferrer" className="underline">{sync.saleOrderName}</a>
    : sync.saleOrderName);
  if (sync.status === 'SYNCED') return <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">Odoo {so}</Badge>;
  if (sync.status === 'MISMATCH') return <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-800">Odoo {so} ยอดไม่ตรง ({baht(sync.amountTotal ?? 0)})</Badge>;
  return <span className="text-xs text-destructive">ส่ง Odoo ไม่สำเร็จ: {sync.error}</span>;
}

/** Admin inbox for web orders with one-click status moves. */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; info?: string }> }) {
  const { status, error, info } = await searchParams;
  const all = await listAllOrders();
  const orders = status ? all.filter((o) => o.status === status) : all;
  const counts = Object.fromEntries((['PENDING', ...ORDER_STATUS_FLOW.slice(1), 'CANCELLED'] as OrderStatus[]).map((s) => [s, all.filter((o) => o.status === s).length])) as Record<OrderStatus, number>;
  const pendingOld = await countStalePending(2 * 60 * 60 * 1000);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ออเดอร์จากเว็บ</h1>
        <p className="text-sm text-muted-foreground">ยืนยันออเดอร์ = สร้างและยืนยันใบสั่งขาย (SO) ใน Odoo อัตโนมัติ · หลังจากนั้นสถานะจัดส่ง/วางบิล/ชำระเงินตามที่คลังและบัญชีทำใน Odoo (ดึงอัตโนมัติทุกไม่กี่นาที)</p>
      </div>
      <form action={adminRefreshStatusesAction}><Button type="submit" size="sm" variant="outline">ดึงสถานะจาก Odoo ตอนนี้</Button></form>
      {info && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800">{info}</p>}
      {pendingOld > 0 && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">มี {pendingOld} ออเดอร์รอยืนยันเกิน 2 ชั่วโมง</p>}
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-1">
        <Link href="/admin/orders" className={cn('rounded-full border px-3 py-1 text-xs', !status ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>ทั้งหมด {all.length}</Link>
        {(Object.keys(counts) as OrderStatus[]).map((s) => <Link key={s} href={`/admin/orders?status=${s}`} className={cn('rounded-full border px-3 py-1 text-xs', status === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{ORDER_STATUS_LABELS[s]} {counts[s]}</Link>)}
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีออเดอร์ — ลองสั่งจาก <Link href="/shop" className="text-primary">หน้าดีลเลอร์</Link></p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            // Once the SO exists in Odoo, delivery/invoice/payment come from Odoo; manual steps are only a fallback.
            const linked = Boolean(o.odoo?.saleOrderId) && o.status !== 'PENDING';
            const next = linked ? undefined : NEXT_LABEL[o.status];
            const progress = o.odoo?.progress;
            return (
              <div key={o.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{o.ref}</span>
                  <Badge variant="outline" className={cn('border-transparent', STYLE[o.status])}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  <span>{o.dealerName}</span>
                  <span className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} · {o.carrier}</span>
                  <Badge variant="outline" className={cn('border-transparent', o.paymentMethod === 'CREDIT' ? 'bg-sky-500/15 text-sky-700' : 'bg-muted text-foreground')}>{o.paymentMethod === 'CREDIT' ? 'เครดิต' : 'เงินสด'}</Badge>
                  {o.poRef && <span className="text-xs text-muted-foreground">PO ร้าน: {o.poRef}</span>}
                  <span className="ml-auto text-right font-bold">{baht(o.total)}{o.cashDiscount > 0 && <span className="block text-xs font-normal text-emerald-700">ลดเงินสดท้ายบิล −{baht(o.cashDiscount)} จาก {baht(o.subtotal)}</span>}{o.coupon && o.couponDiscount > 0 && <span className="block text-xs font-normal text-emerald-700">คูปอง {o.coupon.code} −{baht(o.couponDiscount)}</span>}</span>
                </div>
                <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {o.lines.map((l) => <li key={l.productId}>{l.size ?? l.code} × {l.qty} @ {baht(l.unitPrice)}</li>)}
                </ul>
                {o.note && <p className="mt-1 text-xs">หมายเหตุ: {o.note}</p>}
                {o.status === 'PENDING' && o.paymentMethod === 'CASH' && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-2 text-xs">
                    {o.payment.slipFile ? (
                      <>
                        <a href={`/api/proto/uploads/${o.payment.slipFile}`} target="_blank" rel="noreferrer" className="shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/proto/uploads/${o.payment.slipFile}`} alt="สลิป" className="h-16 rounded border border-border object-cover" />
                        </a>
                        <span>สลิปส่งเมื่อ {new Date(o.payment.slipUploadedAt!).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} · ยอดที่ต้องได้รับ <b>{baht(o.total)}</b></span>
                        {o.payment.verifiedAt ? (
                          <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">ตรวจสลิปแล้ว</Badge>
                        ) : (
                          <form action={verifySlipAction}><input type="hidden" name="orderId" value={o.id} /><Button type="submit" size="sm" variant="outline">ตรวจสลิปแล้ว ยอดถูกต้อง</Button></form>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-700">รอดีลเลอร์แนบสลิป · ยืนยันออเดอร์ได้หลังตรวจสลิป</span>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {next && (
                    <form action={adminAdvanceOrderAction} className="flex items-center gap-2">
                      <input type="hidden" name="orderId" value={o.id} />
                      <input type="hidden" name="expectedStatus" value={o.status} />
                      {o.status === 'PREPARING' && <Input name="trackingRef" placeholder="เลขพัสดุ (ถ้ามี)" className="h-8 w-40" />}
                      <Button type="submit" size="sm" disabled={o.status === 'PENDING' && !isPaymentReady(o)}>{next}</Button>
                    </form>
                  )}
                  {(o.status === 'PENDING' || o.status === 'PREPARING') && (
                    <form action={adminCancelOrderAction}><input type="hidden" name="orderId" value={o.id} /><Button type="submit" size="sm" variant="ghost" className="text-destructive">ยกเลิก</Button></form>
                  )}
                  {linked && ['PREPARING', 'SHIPPED'].includes(o.status) && (
                    <form action={adminSetTrackingAction} className="flex items-center gap-2">
                      <input type="hidden" name="orderId" value={o.id} />
                      <Input name="trackingRef" defaultValue={o.trackingRef ?? ''} placeholder="เลขพัสดุ (ถ้ามี)" className="h-8 w-40" />
                      <Button type="submit" size="sm" variant="outline">บันทึกเลขพัสดุ</Button>
                    </form>
                  )}
                  {!linked && o.trackingRef && <span className="text-xs text-muted-foreground">เลขพัสดุ {o.trackingRef}</span>}
                  {progress && (
                    <span className="text-xs text-muted-foreground">
                      Odoo: จัดส่ง {progress.deliveryStatus === 'full' ? 'ครบ' : progress.deliveryStatus === 'partial' ? 'บางส่วน' : 'ยังไม่ส่ง'}
                      {progress.invoices.length ? ` · ใบแจ้งหนี้ ${progress.invoices.map((i) => i.name).join(', ')}` : ''}
                      {' · '}ตรวจ {new Date(progress.checkedAt).toLocaleString('th-TH', { timeStyle: 'short', dateStyle: 'short' })}
                    </span>
                  )}
                  {o.odoo && <OdooStatus sync={o.odoo} />}
                  {canSyncOrder(o) && (
                    <form action={adminSyncOrderAction}><input type="hidden" name="orderId" value={o.id} /><Button type="submit" size="sm" variant="outline">{o.odoo ? 'ส่งเข้า Odoo อีกครั้ง' : 'ส่งเข้า Odoo'}</Button></form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
