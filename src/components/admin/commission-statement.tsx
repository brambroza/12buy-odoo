import { Fragment } from 'react';
import { EXCLUDED_LABELS, type CommissionAdjustment, type DebtHold, type RepResult } from '@/lib/commission/types';
import { thaiDay } from '@/lib/commission/period';
import { cn } from '@/lib/utils';

const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 1,133.96 → "(1,133.96)" as on accounting sheets. */
const amount = (value: number, deduct = false) => (deduct ? `(${money.format(Math.abs(value))})` : money.format(value));

/**
 * One rep's commission statement laid out like the client's sheet ("สรุปค่าคอมมิชชั่น"): numbered
 * commission rows, overdue invoices given back, total, central fund and overdue holds, adjustments,
 * balance carried, net. Below it, the invoices held or given back and the adjustment reasons.
 */
export function CommissionStatement({ company, periodText, payText, rep, debtDays, holds, adjustments, status }: {
  company: string;
  periodText: string;
  payText: string;
  rep: RepResult;
  debtDays: number;
  holds: DebtHold[];
  adjustments: Pick<CommissionAdjustment, 'amount' | 'reason'>[];
  status: string;
}) {
  const rows: { label: string; value: number; note: string | undefined }[] = [
    ...rep.summary.map((s) => ({ label: s.label, value: s.amount, note: s.base ? `ยอดเก็บก่อน VAT ${money.format(s.base)}${s.rates?.length ? ` · อัตรา ${s.rates.join(', ')}` : ''}` : undefined })),
    { label: `คืนเงินลูกหนี้ค้างชำระ (+${debtDays + 1} วัน)`, value: rep.debtRelease, note: undefined },
  ];
  // Incentive (sales-bonus tier) as the last row of the list; it is not part of the central-fund base.
  const incentive = rep.tier ? rep.tierBonus ?? 0 : 0;
  if (rep.tier) {
    const onOrders = rep.bonusBase === 'SALE_ORDER';
    const measured = onOrders ? `ยอดขายใบสั่งขาย ${money.format(rep.saleOrderBase ?? 0)} (${rep.saleOrderCount ?? 0} ใบ)` : `ยอดเก็บ ${money.format(rep.base)}`;
    const salary = rep.tier.salary !== undefined ? ` · เงินเดือนขั้น ${money.format(rep.tier.salary)} − เงินเดือน ${rep.salary == null ? 'ยังไม่ตั้ง' : money.format(rep.salary)}` : '';
    rows.push({
      label: `Incentive ขั้น ${rep.tier.index}`,
      value: incentive,
      note: `${measured} ถึงขั้นตั้งแต่ ${money.format(rep.tier.minAmount)}${salary}${!onOrders && !rep.targetMet ? ' · ไม่ถึงเป้า ไม่ได้' : ''}`,
    });
  }
  const net = rep.payable + rep.carryOut;
  return (
    <article className="mx-auto max-w-2xl break-after-page space-y-3 rounded-xl border border-border bg-card p-5 text-sm print:max-w-none print:rounded-none print:border-0 print:p-0">
      <header className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <h2 className="col-span-2 text-base font-bold">สรุปค่าคอมมิชชั่น · {company}</h2>
        <span className="text-muted-foreground">ประจำรอบ</span><span className="font-medium">{periodText}</span>
        <span className="text-muted-foreground">พนักงานขาย</span><span className="font-medium">{rep.repName}</span>
        <span className="text-muted-foreground">วันจ่าย / สถานะ</span><span>{payText} · {status}</span>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-border bg-muted/50 text-xs">
            <th className="w-10 py-1.5 text-center font-medium">ที่</th>
            <th className="py-1.5 text-left font-medium">รายการ</th>
            <th className="w-36 py-1.5 text-right font-medium">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className="border-b border-border/60">
              <td className="py-1 text-center tabular-nums">{i + 1}</td>
              <td className="py-1">{r.label}{r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}</td>
              <td className={cn('py-1 text-right tabular-nums', r.value < 0 && 'text-destructive')}>{amount(r.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <Line label="รวม" value={amount(rep.subtotal + incentive)} strong />
          <Line label={`หัก ส่วนกลาง ${rep.centralPercent}%${incentive ? ' (ของค่าคอม ไม่รวม incentive)' : ''}`} value={amount(rep.central, true)} deduct />
          <Line label="หัก ลูกหนี้ค้างชำระ" value={amount(rep.debtHold, true)} deduct />
          {rep.newCustomers?.length ? <Line label={`บวก ลูกค้าใหม่ ${rep.newCustomers.length} ราย${rep.targetMet ? '' : ' · ไม่ถึงเป้า'}`} value={amount(rep.newCustomerBonus ?? 0)} /> : null}
          {rep.adjustments !== 0 && <Line label="ปรับปรุงอื่นๆ" value={amount(rep.adjustments, rep.adjustments < 0)} deduct={rep.adjustments < 0} />}
          {rep.carryIn !== 0 && <Line label="ยอดติดลบยกมาจากรอบก่อน" value={amount(rep.carryIn, true)} deduct />}
          <Line label="คงเหลือ" value={amount(net)} strong double />
          {rep.carryOut < 0 && <tr><td colSpan={3} className="pt-1 text-right text-xs text-destructive">ยอดติดลบ ยกไปหักรอบถัดไป · จ่ายรอบนี้ 0.00</td></tr>}
        </tfoot>
      </table>
      <StepTable rep={rep} />
      <div className="rounded-lg border border-border p-2 text-xs">
        <p className="mb-1 font-medium">ที่มาของตัวเลข (ก่อน VAT)</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4">
          <dt>เงินลูกค้าเข้าบัญชีในรอบนี้</dt><dd className="text-right tabular-nums">{money.format(rep.base)}</dd>
          <dt>นำมาคิดค่าคอม</dt><dd className="text-right tabular-nums">{money.format(rep.counted ?? rep.base)}</dd>
          {(rep.excluded ?? []).map((e) => <Fragment key={e.reason}><dt className="pl-3 text-muted-foreground">ไม่คิด: {EXCLUDED_LABELS[e.reason]}</dt><dd className="text-right tabular-nums text-muted-foreground">{money.format(e.base)}</dd></Fragment>)}
          <dt>เป้า</dt><dd className="text-right">{rep.target === null ? 'ยังไม่ตั้ง' : rep.target === 0 ? 'ไม่ใช้เป้า' : `${money.format(rep.target)} · ${rep.targetMet ? 'ถึงเป้า' : 'ไม่ถึงเป้า ไม่ได้ค่าคอมรอบนี้'}`}</dd>
          {rep.commissionBeforeTarget !== undefined && rep.commissionBeforeTarget !== rep.commission && <><dt>ค่าคอมตามอัตรา (ถ้าถึงเป้า)</dt><dd className="text-right tabular-nums">{money.format(rep.commissionBeforeTarget)}</dd></>}
          {rep.creditNoteCount ? <><dt className="text-muted-foreground">ใบลดหนี้ (CN) รอบนี้ {rep.creditNoteCount} ใบ · ไม่หักค่าคอม</dt><dd className="text-right tabular-nums text-muted-foreground">{money.format(rep.creditNoteBase ?? 0)}</dd></> : null}
        </dl>
      </div>
      {rep.newCustomers?.length ? (
        <p className="text-xs"><span className="font-semibold">ลูกค้าใหม่:</span> {rep.newCustomers.map((c) => `${c.partnerName} (${c.invoiceName})`).join(' · ')}</p>
      ) : null}
      {holds.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold">ลูกหนี้ค้างชำระ (หัก / คืน)</h3>
          <table className="w-full text-xs">
            <tbody>
              {holds.map((h) => (
                <tr key={h.id} className="border-b border-border/60">
                  <td className="py-0.5">{h.invoiceName} · {h.partnerName}</td>
                  <td className="py-0.5">ดิว {thaiDay(h.dueDate)}</td>
                  <td className="py-0.5 text-right tabular-nums">ค้าง {money.format(h.residualBase)} × {h.percent}%</td>
                  <td className="py-0.5 text-right tabular-nums">{h.releasedPeriod ? `คืน ${money.format(h.amount)}` : `หัก (${money.format(h.amount)})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adjustments.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {adjustments.map((a, i) => <li key={i}>ปรับปรุง {amount(a.amount, a.amount < 0)} · {a.reason}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-6 pt-10 text-center text-xs text-muted-foreground print:pt-16">
        {['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'].map((s) => <div key={s} className="border-t border-border pt-1">{s}</div>)}
      </div>
    </article>
  );
}

function Line({ label, value, strong, deduct, double }: { label: string; value: string; strong?: boolean; deduct?: boolean; double?: boolean }) {
  return (
    <tr className={cn(double && 'border-b-4 border-double border-border')}>
      <td />
      <td className={cn('py-1 text-right', strong && 'font-semibold')}>{label} :</td>
      <td className={cn('py-1 text-right tabular-nums', strong && 'font-bold', deduct && 'text-destructive')}>{value}</td>
    </tr>
  );
}

/**
 * Commission per overdue step: how late customers paid and what that did to the pay
 * (e.g. 0–10 days × 110%, beyond the last step × 0%). Lines without a rate are not listed.
 */
export function StepTable({ rep }: { rep: Pick<RepResult, 'steps'> }) {
  if (!rep.steps?.length) return null;
  const total = rep.steps.reduce((sum, s) => ({ base: sum.base + s.base, beforeStep: sum.beforeStep + s.beforeStep, commission: sum.commission + s.commission }), { base: 0, beforeStep: 0, commission: 0 });
  const range = (s: NonNullable<RepResult['steps']>[number]) => (s.minDays === null ? 'เกินขั้นสุดท้าย' : s.maxDays === null ? `${s.minDays} วันขึ้นไป` : `${s.minDays}–${s.maxDays} วัน`);
  return (
    <div className="text-xs">
      <p className="mb-1 font-medium">ขั้นบันไดเกินดิว (นับจากวันครบกำหนดถึงวันเงินเข้า)</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-border bg-muted/50">
            <th className="py-1 text-left font-medium">จ่ายหลังครบกำหนด</th>
            <th className="py-1 text-right font-medium">ยอดก่อน VAT</th>
            <th className="py-1 text-right font-medium">ค่าคอมตามอัตรา</th>
            <th className="py-1 text-right font-medium">× % จ่าย</th>
            <th className="py-1 text-right font-medium">= ค่าคอม</th>
          </tr>
        </thead>
        <tbody>
          {rep.steps.map((s) => (
            <tr key={`${s.minDays}-${s.maxDays}`} className="border-b border-border/60">
              <td className="py-1">{range(s)} <span className="text-muted-foreground">({s.lines} บรรทัด)</span></td>
              <td className="py-1 text-right tabular-nums">{money.format(s.base)}</td>
              <td className="py-1 text-right tabular-nums">{money.format(s.beforeStep)}</td>
              <td className={cn('py-1 text-right tabular-nums', s.percent > 100 && 'text-emerald-700', s.percent < 100 && 'text-destructive')}>{s.percent}%</td>
              <td className="py-1 text-right font-medium tabular-nums">{money.format(s.commission)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="py-1">รวม</td>
            <td className="py-1 text-right tabular-nums">{money.format(total.base)}</td>
            <td className="py-1 text-right tabular-nums">{money.format(total.beforeStep)}</td>
            <td />
            <td className="py-1 text-right tabular-nums">{money.format(total.commission)}</td>
          </tr>
        </tfoot>
      </table>
      {rep.steps.some((s) => s.percent !== 100) && (
        <p className="mt-1 text-muted-foreground">ผลของขั้นบันได: {total.commission - total.beforeStep >= 0 ? 'ได้เพิ่ม' : 'ลดลง'} {money.format(Math.abs(total.commission - total.beforeStep))} บาท (ก่อนเงื่อนไขเป้า)</p>
      )}
    </div>
  );
}
