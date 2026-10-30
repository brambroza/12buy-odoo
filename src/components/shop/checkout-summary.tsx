'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BankAccounts } from '@/components/shop/bank-accounts';
import { SlipField } from '@/components/shop/slip-upload';
import { BANK_ACCOUNTS } from '@/lib/shop/bank-accounts';
import { baht } from '@/lib/shop/catalog';
import { creditAfterOrder } from '@/lib/shop/credit';
import type { PaymentMethod } from '@/lib/shop/types';
import { cn } from '@/lib/utils';

type Bill = { subtotal: number; cashDiscount: number; couponDiscount: number; vatAdded: number; vat: number; total: number };

/**
 * Payment choice + total + submit for the checkout form.
 * The total follows the chosen method (cash shows the end-of-bill discount already taken off).
 * Below `lg` the total and the submit button sit in a bar fixed above the bottom navigation.
 * `blocked` (e.g. a line over stock) disables ordering with that reason on the button.
 * `cashPercent` labels the cash discount when every discounted line has the same %.
 * Cash: the dealer transfers and attaches the slip here first; the order is sent with it (`slip` field).
 */
export function CheckoutSummary({ credit, creditBill, cashBill, cashPercent, creditLine, lineCount, blocked }: {
  credit: boolean; creditBill: Bill; cashBill: Bill; cashPercent: number | null; creditLine: { limit: number | null; used: number } | null; lineCount: number; blocked: string | null;
}) {
  const [method, setMethod] = useState<PaymentMethod>(credit ? 'CREDIT' : 'CASH');
  // Reset on switching to credit: the slip picker unmounts and drops its file.
  const [slipPicked, setSlipPicked] = useState(false);
  const bill = method === 'CASH' ? cashBill : creditBill;
  const afterCredit = creditAfterOrder(creditLine, creditBill.total);
  const overCredit = method === 'CREDIT' && afterCredit.over;
  const reason = blocked ?? (overCredit ? 'เกินวงเงิน' : method === 'CASH' && !slipPicked ? 'แนบสลิปก่อน' : null);
  const usedPct = creditLine?.limit ? Math.min(100, ((creditLine.used + creditBill.total) / creditLine.limit) * 100) : 0;

  return (
    <>
      {credit && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">วิธีชำระเงิน</legend>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="paymentMethod" value="CREDIT" checked={method === 'CREDIT'} onChange={() => { setMethod('CREDIT'); setSlipPicked(false); }} className="mt-1" />
            <span className="flex-1">เครดิต<span className="block text-xs text-muted-foreground">ไม่ต้องแนบสลิป</span></span>
            <span className="font-bold">{baht(creditBill.total)}</span>
          </label>
          {method === 'CREDIT' && afterCredit.remaining !== null && (
            <div className="space-y-1 px-1 text-xs text-muted-foreground">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', afterCredit.over ? 'bg-destructive' : 'bg-emerald-600')} style={{ width: `${usedPct}%` }} />
              </div>
              {afterCredit.over
                ? <p className="text-destructive">เกินวงเงินเครดิต {baht(-afterCredit.remaining)} เลือกเงินสด หรือลดจำนวน</p>
                : <p>วงเงินคงเหลือหลังสั่ง {baht(afterCredit.remaining)} จาก {baht(creditLine!.limit!)}</p>}
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="paymentMethod" value="CASH" checked={method === 'CASH'} onChange={() => setMethod('CASH')} className="mt-1" />
            <span className="flex-1">เงินสด (โอนแล้วแนบสลิป)<span className="block text-xs text-emerald-700 dark:text-emerald-400">{cashBill.cashDiscount > 0 ? `ส่วนลดเงินสดท้ายบิล${cashPercent !== null ? ` ${cashPercent}%` : ''} −${baht(cashBill.cashDiscount)}` : 'ไม่มีส่วนลดสำหรับสินค้าในตะกร้านี้'}</span></span>
            <span className="text-right font-bold">{baht(cashBill.total)}{cashBill.cashDiscount > 0 && <span className="block text-xs font-normal text-muted-foreground line-through">{baht(cashBill.subtotal)}</span>}</span>
          </label>
        </fieldset>
      )}
      {method === 'CASH' && <CashPayment total={cashBill.total} onSlipChange={setSlipPicked} />}
      {/* Phones/tablets: fixed above the bottom nav (md+ has no bottom nav). Desktop: inline at the end of the form. */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-14 max-lg:z-30 max-lg:bg-card max-lg:px-4 max-lg:pb-3 max-lg:shadow-[0_-6px_18px_rgb(0_0_0/0.06)] md:max-lg:bottom-0">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">ยอดที่ต้องชำระ (รวม VAT แล้ว){credit && ` · ${method === 'CASH' ? 'เงินสด' : 'เครดิต'}`}</p>
          <p className="text-2xl font-black leading-tight">{baht(bill.total)}</p>
          {(method === 'CASH' && bill.cashDiscount > 0) || bill.couponDiscount > 0
            ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{[method === 'CASH' && bill.cashDiscount > 0 ? `หักส่วนลดเงินสด${cashPercent !== null ? ` ${cashPercent}%` : ''} ${baht(bill.cashDiscount)}` : '', bill.couponDiscount > 0 ? `คูปอง ${baht(bill.couponDiscount)}` : ''].filter(Boolean).join(' · ')}</p>
            : <p className="text-xs text-muted-foreground">{lineCount} รายการ · VAT {baht(bill.vat)}{bill.vatAdded > 0 ? ` (บวกเพิ่ม ${baht(bill.vatAdded)})` : ''}</p>}
        </div>
        <SubmitOrderButton reason={reason} />
      </div>
    </>
  );
}

/** Bank accounts, the amount to transfer and the slip picker; the slip is required before ordering cash. */
function CashPayment({ total, onSlipChange }: { total: number; onSlipChange: (picked: boolean) => void }) {
  const { pending } = useFormStatus();
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <h3 className="text-sm font-semibold">โอนเงินแล้วแนบสลิป</h3>
        <p className="text-xs text-muted-foreground">ยอดโอน <span className="font-bold text-foreground">{baht(total)}</span> · แนบสลิปก่อนกดยืนยันสั่งซื้อ ฝ่ายขายตรวจสลิปแล้วจึงยืนยันออเดอร์และส่งเข้าระบบ</p>
      </div>
      <BankAccounts accounts={BANK_ACCOUNTS} />
      <SlipField disabled={pending} onChange={onSlipChange} />
    </section>
  );
}

/** Submit button that locks while the order is being placed, so a double tap cannot send it twice. */
function SubmitOrderButton({ reason }: { reason: string | null }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-12 shrink-0 px-6 text-base" disabled={pending || Boolean(reason)} aria-busy={pending}>
      {pending ? <><Loader2 className="size-4 animate-spin" /> กำลังส่งออเดอร์...</> : reason ?? 'ยืนยันสั่งซื้อ'}
    </Button>
  );
}
