import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { BankAccounts } from '@/components/shop/bank-accounts';
import { OrderTimeline } from '@/components/shop/order-timeline';
import { SlipUpload } from '@/components/shop/slip-upload';
import { CancelOrderButton } from '@/components/shop/cancel-order-button';
import { getCurrentUser } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { BANK_ACCOUNTS } from '@/lib/shop/bank-accounts';
import { baht } from '@/lib/shop/catalog';
import { getSessionId } from '@/lib/shop/session';
import { getOrder } from '@/lib/shop/store';
import { refreshIfStale } from '@/lib/shop/status-sync';
import { billTotals, withCoupon } from '@/lib/shop/pricing';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/shop/types';
import { advanceOrderAction, cancelOrderAction, reorderAction, uploadSlipAction } from '../../actions';

/** Order detail with status timeline, lines, and demo controls. */
export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; slip?: string; error?: string }> }) {
  const [{ id }, { placed, slip, error }] = await Promise.all([params, searchParams]);
  const sid = await getSessionId();
  const found = await getOrder(sid, id);
  if (!found) notFound();
  // Delivery/invoice/payment status comes from Odoo; refresh it when the last check is a few minutes old.
  const order = await refreshIfStale(found);
  const nextStatus = ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(order.status) + 1];
  // Demo status buttons: back-office users only, and never unless SHOP_DEMO_CONTROLS=true.
  // Orders from before per-product VAT carry no rate: their prices were VAT-included 7% (Odoo tax "7% (Inc)").
  const bill = withCoupon(billTotals(order.lines.map((l) => ({ ...l, vatRate: l.vatRate ?? 7 })), order.paymentMethod), order.couponDiscount);
  const user = await getCurrentUser();
  const showDemoControls = process.env.SHOP_DEMO_CONTROLS === 'true' && !!user && isBackofficeRole(user.role as Role);

  return (
    // Phones: order number + status come right after the back link (CSS order); desktop keeps the source order.
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/shop/orders" className="inline-flex max-md:-order-2 self-start items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> ออเดอร์ทั้งหมด</Link>

      {placed && (
        <div className="rounded-xl border border-emerald-500/30 max-md:-order-2 bg-emerald-500/5 p-4">
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">รับออเดอร์แล้ว</p>
          <p className="text-sm text-muted-foreground">{order.paymentMethod === 'CREDIT' ? 'สั่งแบบเครดิต ไม่ต้องแนบสลิป ฝ่ายขายยืนยันภายใน 2 ชั่วโมงทำการ' : 'โอนเงินแล้วแนบสลิปด้านล่าง ฝ่ายขายตรวจสลิปและยืนยันภายใน 2 ชั่วโมงทำการ'} ติดตามสถานะได้ที่หน้านี้และหน้า “ออเดอร์”</p>
        </div>
      )}

      {order.status === 'PENDING' && order.paymentMethod === 'CASH' && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">การชำระเงิน (โอนแล้วแนบสลิป)</h2>
          {order.payment.verifiedAt ? (
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">ตรวจสลิปแล้ว รอฝ่ายขายยืนยันออเดอร์</p>
          ) : order.payment.slipFile ? (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">ส่งสลิปแล้ว {new Date(order.payment.slipUploadedAt!).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} · รอฝ่ายขายตรวจ</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">ยอดโอน <span className="font-bold text-foreground">{baht(order.total)}</span> · ยังไม่ได้แนบสลิป ออเดอร์จะถูกยืนยันหลังตรวจสลิปแล้ว</p>
          )}
          {!order.payment.verifiedAt && <div className="mt-3 border-t border-border pt-3"><BankAccounts accounts={BANK_ACCOUNTS} /></div>}
          {order.payment.slipFile && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/proto/uploads/${order.payment.slipFile}`} alt="สลิปโอนเงิน" className="mt-2 max-h-56 rounded-lg border border-border object-contain" />
          )}
          {!order.payment.verifiedAt && (
            <div className="mt-3 border-t border-border pt-3">
              <h3 className="mb-2 text-sm font-semibold">{order.payment.slipFile ? 'ส่งสลิปใหม่' : 'แนบสลิปโอนเงิน'}</h3>
              <SlipUpload orderId={order.id} action={uploadSlipAction} replacing={Boolean(order.payment.slipFile)} />
            </div>
          )}
          {slip && <p className="mt-2 text-xs text-emerald-700">แนบสลิปเรียบร้อย</p>}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </section>
      )}

      <div className="max-md:-order-1">
        <h1 className="text-xl font-bold">{order.ref}</h1>
        <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} · {order.dealerName}</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 max-md:-order-1">
        <h2 className="mb-3 text-sm font-semibold">สถานะ: {ORDER_STATUS_LABELS[order.status]}</h2>
        <OrderTimeline order={order} />
        {order.status === 'PREPARING' && order.odoo?.progress?.deliveryStatus === 'partial' && (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">ส่งของแล้วบางส่วน ที่เหลือกำลังจัดส่ง</p>
        )}
        {order.odoo?.progress?.invoices.map((inv) => (
          <p key={inv.name} className="mt-2 text-sm text-muted-foreground">
            ใบแจ้งหนี้ <span className="font-medium text-foreground">{inv.name}</span>
            {inv.amountResidual > 0 ? ` · ค้างชำระ ${baht(inv.amountResidual)}` : ' · ชำระครบแล้ว'}
            {inv.amountResidual > 0 && inv.dueDate ? ` · ครบกำหนด ${new Date(inv.dueDate).toLocaleDateString('th-TH', { dateStyle: 'medium' })}` : ''}
          </p>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">รายการสินค้า</h2>
        <ul className="divide-y divide-border">
          {order.lines.map((line) => (
            <li key={`${line.productId}-${line.unitId ?? 'base'}`} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                {line.size && <span className="mr-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{line.size}</span>}
                <span className="break-words">{line.name}</span>
                <p className="text-xs text-muted-foreground">{line.unitName && line.unitQty ? `${line.unitQty} ${line.unitName} (${line.qty})` : line.qty} × {baht(line.unitPrice)}</p>
              </div>
              <span className="shrink-0 font-semibold">{baht(line.qty * line.unitPrice)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1 border-t border-border pt-2">
          {(order.cashDiscount > 0 || order.couponDiscount > 0) && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">รวมราคาสินค้า</span><span>{baht(order.subtotal)}</span></div>
          )}
          {order.cashDiscount > 0 && (
            <div className="flex justify-between text-sm text-emerald-700 dark:text-emerald-400"><span>ส่วนลดเงินสด (ท้ายบิล)</span><span>−{baht(order.cashDiscount)}</span></div>
          )}
          {order.couponDiscount > 0 && order.coupon && (
            <div className="flex justify-between gap-2 text-sm text-emerald-700 dark:text-emerald-400"><span>คูปอง <span className="font-mono">{order.coupon.code}</span> · {order.coupon.label}</span><span>−{baht(order.couponDiscount)}</span></div>
          )}
          {bill.vatAdded > 0 && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT 7% ของสินค้าที่ราคายังไม่รวม VAT</span><span>+{baht(bill.vatAdded)}</span></div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">ยอดที่ต้องชำระ (รวม VAT แล้ว) · {PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
            <span className="text-xl font-black">{baht(order.total)}</span>
          </div>
          {bill.vat > 0 && <p className="text-right text-xs text-muted-foreground">ในยอดนี้มี VAT {baht(bill.vat)}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="mb-1 font-semibold">จัดส่ง</h2>
        <p className="whitespace-pre-line text-muted-foreground">{order.address}</p>
        <p className="mt-1">การจัดส่ง: {order.carrier}</p>
        {order.poRef && <p className="mt-1">เลขที่ใบสั่งซื้อของร้าน: {order.poRef}</p>}
        {order.note && <p className="mt-1 text-muted-foreground">หมายเหตุ: {order.note}</p>}
      </section>

      <div className="flex flex-wrap gap-2">
        <form action={reorderAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <Button type="submit" variant="outline" className="h-11"><RotateCcw className="size-4" /> สั่งซ้ำ</Button>
        </form>
        {order.status === 'PENDING' && (
          <CancelOrderButton orderId={order.id} orderRef={order.ref} action={cancelOrderAction} />
        )}
      </div>

      {showDemoControls && nextStatus && order.status !== 'CANCELLED' && (
        <form action={advanceOrderAction} className="rounded-xl border border-dashed border-border p-3">
          <input type="hidden" name="orderId" value={order.id} />
          <p className="mb-2 text-xs text-muted-foreground">ปุ่มเดโม (จำลองฝ่ายขาย/คลัง): เลื่อนสถานะไป “{ORDER_STATUS_LABELS[nextStatus]}”</p>
          <Button type="submit" variant="secondary" size="sm">เลื่อนสถานะถัดไป</Button>
        </form>
      )}
    </div>
  );
}
