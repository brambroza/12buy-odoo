import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { BankAccounts } from '@/components/shop/bank-accounts';
import { OrderTimeline } from '@/components/shop/order-timeline';
import { SlipUpload } from '@/components/shop/slip-upload';
import { CreditPaymentForm } from '@/components/shop/credit-payment-form';
import { Badge } from '@/components/ui/badge';
import { canPayCredit, creditOutstanding, creditPayments, creditPendingAmount } from '@/lib/shop/credit-payment';
import { CancelOrderButton } from '@/components/shop/cancel-order-button';
import { getCurrentUser } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { getWireTransferAccounts } from '@/lib/odoo/wire-transfer';
import { baht } from '@/lib/shop/catalog';
import { getSessionId } from '@/lib/shop/session';
import { getOrder } from '@/lib/shop/store';
import { refreshIfStale } from '@/lib/shop/status-sync';
import { billTotals, uniformCashPercent, withCoupon } from '@/lib/shop/pricing';
import { CREDIT_PAYMENT_STATUS_LABELS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type CreditPaymentStatus } from '@/lib/shop/types';
import { cn } from '@/lib/utils';
import { advanceOrderAction, cancelOrderAction, reorderAction, submitCreditPaymentAction, uploadSlipAction } from '../../actions';

const CREDIT_PAYMENT_STYLE: Record<CreditPaymentStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  VERIFIED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'bg-destructive/15 text-destructive',
};
const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

/** Order detail with status timeline, lines, and demo controls. */
export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; slip?: string; paid?: string; error?: string }> }) {
  const [{ id }, { placed, slip, paid, error }] = await Promise.all([params, searchParams]);
  const sid = await getSessionId();
  const found = await getOrder(sid, id);
  if (!found) notFound();
  // Delivery/invoice/payment status comes from Odoo; refresh it when the last check is a few minutes old.
  const order = await refreshIfStale(found);
  // Credit dealers pay per order from this page once sales confirmed it; cash orders show the bank list until the slip is checked.
  const payCredit = canPayCredit(order);
  const bank = (order.status === 'PENDING' && order.paymentMethod === 'CASH' && !order.payment.verifiedAt) || payCredit ? await getWireTransferAccounts() : null;
  const payments = creditPayments(order);
  const outstanding = payCredit ? creditOutstanding(order) : 0;
  const pendingAmount = creditPendingAmount(order);
  const nextStatus = ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(order.status) + 1];
  // Demo status buttons: back-office users only, and never unless SHOP_DEMO_CONTROLS=true.
  // Orders from before per-product VAT carry no rate: their prices were VAT-included 7% (Odoo tax "7% (Inc)").
  const bill = withCoupon(billTotals(order.lines.map((l) => ({ ...l, vatRate: l.vatRate ?? 7 })), order.paymentMethod), order.couponDiscount);
  const cashPercent = uniformCashPercent(order.lines);
  const user = await getCurrentUser();
  const showDemoControls = process.env.SHOP_DEMO_CONTROLS === 'true' && !!user && isBackofficeRole(user.role as Role);

  return (
    // Phones: order number + status come right after the back link (CSS order); desktop keeps the source order.
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/shop/orders" className="inline-flex max-md:-order-2 self-start items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> ออเดอร์ทั้งหมด</Link>

      {placed && (
        <div className="rounded-xl border border-emerald-500/30 max-md:-order-2 bg-emerald-500/5 p-4">
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">รับออเดอร์แล้ว</p>
          <p className="text-sm text-muted-foreground">{order.paymentMethod === 'CREDIT' ? 'สั่งแบบเครดิต ไม่ต้องแนบสลิป ฝ่ายขายยืนยันภายใน 2 ชั่วโมงทำการ' : order.payment.slipFile ? 'ได้รับสลิปแล้ว ฝ่ายขายตรวจสลิปและยืนยันภายใน 2 ชั่วโมงทำการ' : 'โอนเงินแล้วแนบสลิปด้านล่าง ฝ่ายขายตรวจสลิปและยืนยันภายใน 2 ชั่วโมงทำการ'} ติดตามสถานะได้ที่หน้านี้และหน้า “ออเดอร์”</p>
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
          {bank && <div className="mt-3 border-t border-border pt-3"><BankAccounts accounts={bank.accounts} error={bank.error} /></div>}
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

      {(payCredit || payments.length > 0) && (
        <section id="credit-payment" className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <h2 className="text-sm font-semibold">ชำระเงิน (ออเดอร์เครดิต)</h2>
          {payCredit ? (
            <p className="mt-1 text-sm text-muted-foreground">
              ยอดค้างชำระ <span className="font-bold text-foreground">{baht(outstanding)}</span>
              {pendingAmount > 0 && <> · แจ้งโอนแล้ว รอตรวจ <span className="font-medium text-amber-700 dark:text-amber-400">{baht(pendingAmount)}</span></>}
              {order.odoo?.progress?.invoices.some((inv) => inv.amountResidual > 0 && inv.dueDate) && (
                <> · ครบกำหนด {new Date(order.odoo.progress.invoices.find((inv) => inv.amountResidual > 0 && inv.dueDate)!.dueDate!).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{order.status === 'PAID' ? 'ชำระครบแล้ว ขอบคุณค่ะ' : 'ประวัติการแจ้งโอนของออเดอร์นี้'}</p>
          )}
          {paid && <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">แจ้งโอนเรียบร้อย ฝ่ายบัญชีตรวจเงินเข้าแล้วจะอัปเดตสถานะเป็น “ชำระแล้ว”</p>}
          {error && !payCredit && <p className="mt-2 text-xs text-destructive">{error}</p>}
          {payments.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
              {[...payments].reverse().map((p) => (
                <li key={p.id} className="flex items-start gap-3 p-3 text-sm">
                  <a href={`/api/proto/uploads/${p.slipFile}`} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/proto/uploads/${p.slipFile}`} alt="สลิป" className="h-16 w-12 rounded border border-border object-cover" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{baht(p.amount)}</span>
                      <Badge variant="outline" className={cn('border-transparent', CREDIT_PAYMENT_STYLE[p.status])}>{CREDIT_PAYMENT_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">แจ้งเมื่อ {dateTime(p.uploadedAt)}{p.reviewedAt ? ` · ตรวจเมื่อ ${dateTime(p.reviewedAt)}` : ''}</p>
                    {p.note && <p className="text-xs text-muted-foreground">หมายเหตุ: {p.note}</p>}
                    {p.status === 'REJECTED' && <p className="text-xs text-destructive">ไม่ผ่าน{p.rejectReason ? `: ${p.rejectReason}` : ''} · ส่งสลิปใหม่ด้านล่าง</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {payCredit && (
            <div className="mt-3 border-t border-sky-500/20 pt-3">
              {bank && <BankAccounts accounts={bank.accounts} error={bank.error} />}
              <h3 className="mb-2 mt-3 text-sm font-semibold">แจ้งโอนชำระ</h3>
              <CreditPaymentForm orderId={order.id} outstanding={outstanding} action={submitCreditPaymentAction} />
              {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            </div>
          )}
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
            <div className="flex justify-between text-sm text-emerald-700 dark:text-emerald-400"><span>ส่วนลดเงินสด{cashPercent !== null ? ` ${cashPercent}%` : ''} (ท้ายบิล)</span><span>−{baht(order.cashDiscount)}</span></div>
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
