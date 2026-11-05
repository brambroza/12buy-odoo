import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { payDate, periodLabel, periodOf, shiftPeriod, thaiDay, todayBangkok } from '@/lib/commission/period';
import { getSource, listRepsOfUser, listRuns } from '@/lib/commission/repo';
import { repEstimate } from '@/lib/commission/service';
import { RUN_STATUS_LABELS, RUN_STATUS_TONE } from '@/lib/commission/types';
import { baht } from '@/lib/shop/catalog';
import { cn } from '@/lib/utils';

/**
 * A rep's own commission: this period's collections against the target with an estimate (from the
 * last pull, not final until approved), last period, and approved / paid runs. Only reps linked to
 * the signed-in login (on "พนักงานขาย") are shown; nobody else's figures are read.
 */
export default async function MyCommissionPage() {
  const user = await requirePermission('commission.view_own');
  const reps = await listRepsOfUser(user.id);
  const today = todayBangkok();

  const blocks = await Promise.all(reps.map(async (rep) => {
    const source = await getSource(rep.sourceId);
    if (!source || !source.active) return null;
    const current = periodOf(today, source.cutoffDay);
    const [now, previous, runs] = await Promise.all([
      repEstimate(source, current, rep.odooUserId),
      repEstimate(source, shiftPeriod(current, -1), rep.odooUserId),
      listRuns(source.id),
    ]);
    const history = runs.filter((r) => r.status === 'APPROVED' || r.status === 'PAID');
    const paid = await Promise.all(history.slice(0, 12).map(async (r) => ({ run: r, rep: (await repEstimate(source, r.period, rep.odooUserId)).rep })));
    return { rep, source, current, now, previous, paid };
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ค่าคอมของฉัน</h1>
        <p className="text-sm text-muted-foreground">ยอดเก็บนับจากวันเงินเข้าบัญชี ตัวเลขรอบที่ยังไม่อนุมัติเป็นประมาณการจากข้อมูลที่ดึงล่าสุด</p>
      </div>
      {reps.length === 0 && <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">บัญชีนี้ยังไม่ได้ผูกกับพนักงานขายใน Odoo ติดต่อแอดมินให้ผูกที่หน้า “ค่าคอม → พนักงานขาย”</p>}
      {blocks.map((b) => b && (
        <section key={b.rep.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">{b.source.name} · {b.rep.name}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {[{ label: 'รอบนี้', period: b.current, data: b.now }, { label: 'รอบก่อน', period: shiftPeriod(b.current, -1), data: b.previous }].map(({ label, period, data }) => {
              const r = data.rep;
              const pct = r?.target ? Math.min(100, Math.round((r.base / r.target) * 100)) : null;
              return (
                <div key={period} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label} · {periodLabel(period, b.source.cutoffDay)} · จ่าย {thaiDay(payDate(period))}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{baht(r?.payable ?? 0)} <span className="text-xs font-normal text-muted-foreground">{data.locked ? 'อนุมัติแล้ว' : 'ประมาณการ'}</span></p>
                  <p className="text-sm">ยอดเก็บ {baht(r?.base ?? 0)}{r?.target ? ` / เป้า ${baht(r.target)}` : r?.target === 0 ? ' · ไม่ใช้เป้า' : ' · ยังไม่ตั้งเป้า'}</p>
                  {pct !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full', r && r.base >= (r.target ?? 0) ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} /></div>}
                  {!data.run?.syncedAt && <p className="mt-1 text-xs text-muted-foreground">ยังไม่มีการดึงข้อมูลรอบนี้</p>}
                </div>
              );
            })}
          </div>
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow><TableHead>รอบ</TableHead><TableHead>สถานะ</TableHead><TableHead className="text-right">ยอดเก็บ</TableHead><TableHead className="text-right">ได้รับ</TableHead><TableHead className="w-10" /></TableRow>
              </TableHeader>
              <TableBody>
                {b.paid.length === 0 && <EmptyRow colSpan={5}>ยังไม่มีรอบที่อนุมัติ</EmptyRow>}
                {b.paid.map(({ run, rep }) => (
                  <TableRow key={run.id}>
                    <TableCell data-label="รอบ">{periodLabel(run.period, b.source.cutoffDay)}</TableCell>
                    <TableCell data-label="สถานะ"><Badge variant="outline" className={`border-transparent ${RUN_STATUS_TONE[run.status]}`}>{RUN_STATUS_LABELS[run.status]}</Badge></TableCell>
                    <TableCell data-label="ยอดเก็บ" className="text-right tabular-nums">{baht(rep?.base ?? 0)}</TableCell>
                    <TableCell data-label="ได้รับ" className="text-right font-semibold tabular-nums">{baht(rep?.payable ?? 0)}</TableCell>
                    <TableCell>
                      {rep && <Link href={`/admin/commission/runs/${run.period}/statement?source=${b.source.id}&rep=${b.rep.odooUserId}`} title="ใบสรุปค่าคอม" aria-label={`ใบสรุปค่าคอมรอบ ${run.period}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><FileText className="size-4" /></Link>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </section>
      ))}
    </div>
  );
}
