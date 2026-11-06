import { Copy, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext } from '@/lib/commission/context';
import { periodLabel } from '@/lib/commission/period';
import { getRun, listLedger, listReps, listTargets } from '@/lib/commission/repo';
import { isLocked } from '@/lib/commission/service';
import { baht } from '@/lib/shop/catalog';
import { copyTargetsAction, importTargetsAction, saveTargetsAction } from '../actions';

const PATH = '/admin/commission/targets';
const input = 'h-9 w-36 rounded-lg border border-border bg-background px-2 text-right text-sm';
type Search = { source?: string; period?: string; saved?: string; error?: string };

/**
 * Collection target (before VAT) per rep for a period. Below target = no commission that period.
 * Blank = not set (the run cannot be submitted), 0 = no target for that rep.
 */
export default async function CommissionTargetsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  const [reps, targets, ledger, run] = source
    ? await Promise.all([listReps(source.id), listTargets(source.id, ctx.period), listLedger(source.id, ctx.period), getRun(source.id, ctx.period)])
    : [[], [], [], null];
  const targetOf = new Map(targets.map((t) => [t.odooUserId, t.amount]));
  const collected = new Map<number, number>();
  for (const l of ledger) if (l.odooUserId !== null) collected.set(l.odooUserId, (collected.get(l.odooUserId) ?? 0) + l.base);
  const locked = isLocked(run);
  const active = reps.filter((r) => r.active);
  const hidden = source && (<><input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={ctx.period} /></>);

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="เป้ายอดเก็บ"
        description={source ? `รอบ ${periodLabel(ctx.period, source.cutoffDay)} · ยอดเก็บก่อน VAT ไม่ถึงเป้า = ไม่ได้ค่าคอมรอบนั้น · ว่าง = ยังไม่ตั้ง (ส่งอนุมัติไม่ได้) · 0 = ไม่ใช้เป้า` : undefined} />
      <Notice saved={params.saved} error={params.error} />
      {locked && <p className="rounded-lg bg-muted p-3 text-sm">รอบนี้อนุมัติแล้ว แก้เป้าไม่ได้</p>}
      {!source ? <NoSource /> : (
        <>
          <form action={saveTargetsAction} className="space-y-3">
            {hidden}
            <TableCard>
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>พนักงานขาย</TableHead>
                    <TableHead className="text-right">เป้า (บาท ก่อน VAT)</TableHead>
                    <TableHead className="text-right">เก็บได้ตอนนี้</TableHead>
                    <TableHead className="text-right">% ของเป้า</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.length === 0 && <EmptyRow colSpan={4}>ยังไม่มีพนักงานขาย ดึงจาก Odoo ที่หน้า “พนักงานขาย”</EmptyRow>}
                  {active.map((r) => {
                    const target = targetOf.get(r.odooUserId);
                    const got = collected.get(r.odooUserId) ?? 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell data-label="พนักงานขาย" className="font-medium">{r.name}</TableCell>
                        <TableCell data-label="เป้า" className="text-right">
                          <input name={`t_${r.odooUserId}`} type="number" min={0} step="0.01" inputMode="decimal" defaultValue={target ?? ''} disabled={locked} aria-label={`เป้าของ ${r.name}`} className={input} />
                        </TableCell>
                        <TableCell data-label="เก็บได้" className="text-right tabular-nums">{baht(got)}</TableCell>
                        <TableCell data-label="% ของเป้า" className="text-right tabular-nums">
                          {target ? <span className={got >= target ? 'text-emerald-700' : 'text-amber-700'}>{Math.round((got / target) * 100)}%</span> : <span className="text-muted-foreground">{target === 0 ? 'ไม่ใช้เป้า' : 'ยังไม่ตั้ง'}</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableCard>
            {!locked && active.length > 0 && <Button type="submit" size="sm">บันทึกเป้า</Button>}
          </form>
          {!locked && (
            <div className="grid gap-3 lg:grid-cols-2">
              <form action={copyTargetsAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                {hidden}
                <span className="flex-1">คัดลอกเป้าจากรอบก่อน (เฉพาะคนที่ยังไม่ตั้ง)</span>
                <Button type="submit" size="sm" variant="outline"><Copy /> คัดลอก</Button>
              </form>
              <form action={importTargetsAction} className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
                {hidden}
                <label className="block text-xs font-medium">นำเข้าจาก Excel: คัดลอก 2 คอลัมน์ (ชื่อพนักงานขาย เช่น Tip, ยอดเป้า) มาวาง
                  <textarea name="paste" rows={4} placeholder={'สมชาย ใจดี\t500000\nสมหญิง รักงาน\t350000'} className="mt-1 w-full rounded-lg border border-border bg-background p-2 font-mono text-xs" />
                </label>
                <Button type="submit" size="sm" variant="outline"><Upload /> นำเข้า</Button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
