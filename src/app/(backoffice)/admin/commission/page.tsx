import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, IconLink, TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { periodDates, periodLabel, thaiDay } from '@/lib/commission/period';
import { listRuns, runTotals } from '@/lib/commission/repo';
import { RUN_STATUS_LABELS, RUN_STATUS_TONE } from '@/lib/commission/types';
import { baht } from '@/lib/shop/catalog';

const PATH = '/admin/commission';
type Search = { source?: string; period?: string; saved?: string; error?: string };

/** Commission runs of the chosen company, newest period first, with a shortcut to the chosen period. */
export default async function CommissionRunsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.view');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  const runs = source ? await listRuns(source.id) : [];
  const totals = source ? await runTotals(source.id, runs.filter((r) => r.syncedAt && !r.calculatedAt).map((r) => r.period)) : new Map();
  const runHref = (period: string) => `${PATH}/runs/${period}?${ctxQuery({ source, period })}`;

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="ค่าคอมพนักงานขาย"
        description="ขั้นตอน: ดึงเงินเข้าจาก Odoo → ตรวจยอดเก็บ → คำนวณ → ส่งอนุมัติ → อนุมัติ (อีกคน) → จ่ายแล้ว"
        actions={source && <Button size="sm" nativeButton={false} render={<Link href={runHref(ctx.period)} />}>เปิดรอบ {periodLabel(ctx.period, ctx.calendar).split(' (')[0]} <ArrowRight /></Button>} />
      <Notice saved={params.saved} error={params.error} />
      {!source ? <NoSource /> : (
        <TableCard>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>รอบ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>ดึงข้อมูล / คำนวณ</TableHead>
                <TableHead>วันจ่าย</TableHead>
                <TableHead className="text-right">ยอดเก็บทั้งหมด (ก่อน VAT)</TableHead>
                <TableHead className="text-right">นำมาคิดค่าคอม</TableHead>
                <TableHead className="text-right">ค่าคอมรวม</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && <EmptyRow colSpan={8}>ยังไม่มีรอบ เลือกรอบด้านบนแล้วกด “เปิดรอบ”</EmptyRow>}
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell data-label="รอบ" className="font-medium">{periodLabel(r.period, ctx.calendar)}</TableCell>
                  <TableCell data-label="สถานะ"><Badge variant="outline" className={`border-transparent ${RUN_STATUS_TONE[r.status]}`}>{RUN_STATUS_LABELS[r.status]}</Badge></TableCell>
                  <TableCell data-label="ดึง/คำนวณ" className="text-xs">{r.syncedAt ? r.syncedAt.toLocaleDateString('th-TH') : '—'} / {r.calculatedAt ? r.calculatedAt.toLocaleDateString('th-TH') : '—'}</TableCell>
                  <TableCell data-label="วันจ่าย" className="text-xs">{thaiDay(periodDates(ctx.calendar, r.period).payDate)}{r.paidAt && <span className="block text-emerald-700">จ่าย {r.paidAt.toLocaleDateString('th-TH')}</span>}</TableCell>
                  <TableCell data-label="ยอดเก็บทั้งหมด" className="text-right tabular-nums">{totals.get(r.period) ? baht(totals.get(r.period)!.collected) : '—'}</TableCell>
                  <TableCell data-label="นำมาคิดค่าคอม" className="text-right tabular-nums">
                    {(() => {
                      const t = totals.get(r.period);
                      if (!t) return '—';
                      if (t.counted === null) return <span className="text-xs text-muted-foreground">ยังไม่คำนวณ</span>;
                      return <>{baht(t.counted)}{t.collected > 0 && <span className="block text-xs text-muted-foreground">{Math.round((t.counted / t.collected) * 100)}% ของยอดเก็บ</span>}</>;
                    })()}
                  </TableCell>
                  <TableCell data-label="ค่าคอมรวม" className="text-right font-semibold tabular-nums">{r.calculatedAt ? baht(r.totalPayable) : '—'}</TableCell>
                  <TableCell><IconLink href={runHref(r.period)} label={`เปิดรอบ ${r.period}`}><ArrowRight /></IconLink></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
