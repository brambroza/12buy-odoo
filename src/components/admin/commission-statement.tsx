import type { CommissionAdjustment, DebtHold, RepResult } from '@/lib/commission/types';
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
  const rows = [
    ...rep.summary.map((s) => ({ label: s.label, value: s.amount, note: s.base ? `ยอดเก็บก่อน VAT ${money.format(s.base)}${s.rates?.length ? ` · อัตรา ${s.rates.join(', ')}` : ''}` : undefined })),
    { label: `คืนเงินลูกหนี้ค้างชำระ (+${debtDays + 1} วัน)`, value: rep.debtRelease, note: undefined },
  ];
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
          <Line label="รวม" value={amount(rep.subtotal)} strong />
          <Line label={`หัก ส่วนกลาง ${rep.centralPercent}%`} value={amount(rep.central, true)} deduct />
          <Line label="หัก ลูกหนี้ค้างชำระ" value={amount(rep.debtHold, true)} deduct />
          {rep.adjustments !== 0 && <Line label="ปรับปรุงอื่นๆ" value={amount(rep.adjustments, rep.adjustments < 0)} deduct={rep.adjustments < 0} />}
          {rep.carryIn !== 0 && <Line label="ยอดติดลบยกมาจากรอบก่อน" value={amount(rep.carryIn, true)} deduct />}
          <Line label="คงเหลือ" value={amount(net)} strong double />
          {rep.carryOut < 0 && <tr><td colSpan={3} className="pt-1 text-right text-xs text-destructive">ยอดติดลบ ยกไปหักรอบถัดไป · จ่ายรอบนี้ 0.00</td></tr>}
        </tfoot>
      </table>
      <p className="text-xs text-muted-foreground">
        ยอดเก็บก่อน VAT {money.format(rep.base)}{rep.target ? ` · เป้า ${money.format(rep.target)} (${rep.targetMet ? 'ถึงเป้า' : 'ไม่ถึงเป้า ไม่ได้ค่าคอมรอบนี้'})` : rep.target === 0 ? ' · ไม่ใช้เป้า' : ''}
      </p>
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
