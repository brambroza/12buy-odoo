import Link from 'next/link';
import { Copy, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { periodLabel } from '@/lib/commission/period';
import { paysBySalary, pickTier, tierBonusAmount } from '@/lib/commission/bonus';
import { getRun, listLedger, listReps, listSalaries, listSaleOrders, listTargets } from '@/lib/commission/repo';
import { isLocked, targetReps } from '@/lib/commission/service';
import { BONUS_BASE_LABELS, isSalesBase } from '@/lib/commission/types';
import { baht } from '@/lib/shop/catalog';
import { copyTargetsAction, importTargetsAction, saveTargetsAction } from '../actions';

const PATH = '/admin/commission/targets';
const input = 'h-9 w-36 rounded-lg border border-border bg-background px-2 text-right text-sm';
type Search = { source?: string; period?: string; saved?: string; error?: string };

/**
 * Collection target (before VAT) and salary per rep for a period, one row per "Sale …" customer tag
 * (as on every other commission page) plus any salesperson that collected on untagged customers. Below target = no commission that
 * period. Blank target = not set (the run cannot be submitted), 0 = no target for that rep. The salary
 * is used by a bonus ladder with tier salaries: bonus = salary of the tier reached − the rep's salary.
 */
export default async function CommissionTargetsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  const [{ reps: active, odooError }, targets, run, salaries, stored, ledger] = source
    ? await Promise.all([targetReps(source, ctx.period), listTargets(source.id, ctx.period), getRun(source.id, ctx.period), listSalaries(source.id, ctx.period), listReps(source.id), listLedger(source.id, ctx.period)])
    : [{ reps: [], odooError: null }, [], null, [], [], []];
  const targetOf = new Map(targets.map((t) => [t.odooUserId, t.amount]));
  const salaryOf = new Map(salaries.map((x) => [x.odooUserId, x.amount]));
  const tiers = source?.bonusTiers ?? [];
  // Incentive on sale orders: the tier preview uses each rep's confirmed orders of the last pull.
  const onOrders = isSalesBase(source?.bonusBase);
  const orderTotals = new Map<number, number>();
  if (source && onOrders) for (const o of await listSaleOrders(source.id, ctx.period)) if (o.odooUserId !== null) orderTotals.set(o.odooUserId, (orderTotals.get(o.odooUserId) ?? 0) + o.amountUntaxed);
  const bySalary = paysBySalary(tiers);
  const locked = isLocked(run);
  // Collections of reps switched off on the reps page: paid to nobody, so not listed below.
  const offIds = new Set(stored.filter((r) => !r.active).map((r) => r.odooUserId));
  const offTotals = new Map<number, number>();
  for (const l of ledger) if (l.odooUserId !== null && offIds.has(l.odooUserId)) offTotals.set(l.odooUserId, (offTotals.get(l.odooUserId) ?? 0) + l.base);
  const offList = [...offTotals].filter(([, base]) => base !== 0).map(([id, base]) => ({ base, name: stored.find((r) => r.odooUserId === id)?.name ?? `#${id}` }));
  const hidden = source && (<><input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={ctx.period} /></>);

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="เป้ายอดเก็บ"
        description={source ? `รอบ ${periodLabel(ctx.period, ctx.calendar)} · ยอดเก็บก่อน VAT ไม่ถึงเป้า = ไม่ได้ค่าคอมรอบนั้น · ว่าง = ยังไม่ตั้ง (ส่งอนุมัติไม่ได้) · 0 = ไม่ใช้เป้า · เงินเดือนใช้คิด incentive = เงินเดือนของขั้นที่ถึง − เงินเดือนเซลล์${isSalesBase(source.bonusBase) ? ` · incentive วัดจาก${BONUS_BASE_LABELS[source.bonusBase]} ไม่ต้องถึงเป้า` : ''}` : undefined} />
      <Notice saved={params.saved} error={params.error} />
      {locked && <p className="rounded-lg bg-muted p-3 text-sm">รอบนี้อนุมัติแล้ว แก้เป้าและเงินเดือนไม่ได้</p>}
      {source && tiers.length > 0 && !bySalary && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">ขั้นเงินพิเศษยังไม่มีเงินเดือนของแต่ละขั้น ตอนนี้จ่ายตามช่องเงินพิเศษ ไม่ได้ใช้เงินเดือนเซลล์ · ใส่เงินเดือนของขั้นที่ tab “เงินพิเศษ / ลูกค้าใหม่”</p>}
      {odooError && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">อ่านรายชื่อ tag “Sale …” จาก Odoo ไม่ได้ ({odooError}) แสดงจากรายชื่อที่ดึงไว้และยอดเก็บแทน</p>}
      {offList.length > 0 && (
        <p role="alert" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">
          มียอดเก็บของเซลล์ที่ปิดใช้งาน ไม่นับให้ใคร: {offList.map((o) => `${o.name} ${baht(o.base)}`).join(' · ')} · เปิดใช้งานได้ที่ <Link href={`/admin/commission/reps?${ctxQuery(ctx)}`} className="underline">หน้าพนักงานขาย</Link>
        </p>
      )}
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
                    {onOrders && <TableHead className="text-right">{BONUS_BASE_LABELS[source!.bonusBase]} (ก่อน VAT)</TableHead>}
                    <TableHead className="text-right">เงินเดือน (บาท)</TableHead>
                    <TableHead className="text-right">Incentive ตอนนี้</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.length === 0 && <EmptyRow colSpan={onOrders ? 7 : 6}>ยังไม่มี tag “Sale …” ใน Odoo และยังไม่มียอดเก็บรอบนี้</EmptyRow>}
                  {active.map((r) => {
                    const target = targetOf.get(r.odooUserId);
                    const got = r.collected;
                    const salary = salaryOf.get(r.odooUserId);
                    const ordered = orderTotals.get(r.odooUserId) ?? 0;
                    const tier = pickTier(tiers, onOrders ? ordered : got);
                    return (
                      <TableRow key={r.odooUserId}>
                        <TableCell data-label="พนักงานขาย" className="font-medium">
                          {r.tag ? `Sale ${r.name}` : r.name}
                          {!r.tag && <span className="block text-xs font-normal text-amber-700">ไม่มี tag Sale · ยอดจาก Salesperson ของลูกค้าที่ไม่มี tag</span>}
                        </TableCell>
                        <TableCell data-label="เป้า" className="text-right">
                          <input name={`t_${r.odooUserId}`} type="number" min={0} step="0.01" inputMode="decimal" defaultValue={target ?? ''} disabled={locked} aria-label={`เป้าของ ${r.name}`} className={input} />
                        </TableCell>
                        <TableCell data-label="เก็บได้" className="text-right tabular-nums">{baht(got)}</TableCell>
                        <TableCell data-label="% ของเป้า" className="text-right tabular-nums">
                          {target ? <span className={got >= target ? 'text-emerald-700' : 'text-amber-700'}>{Math.round((got / target) * 100)}%</span> : <span className="text-muted-foreground">{target === 0 ? 'ไม่ใช้เป้า' : 'ยังไม่ตั้ง'}</span>}
                        </TableCell>
                        {onOrders && <TableCell data-label="ยอดขาย" className="text-right tabular-nums">{baht(ordered)}</TableCell>}
                        <TableCell data-label="เงินเดือน" className="text-right">
                          <input name={`s_${r.odooUserId}`} type="number" min={0} step="0.01" inputMode="decimal" defaultValue={salary ?? ''} disabled={locked} aria-label={`เงินเดือนของ ${r.name}`} className={input} />
                        </TableCell>
                        <TableCell data-label="เงินพิเศษตอนนี้" className="text-right text-xs tabular-nums">
                          {!tier ? <span className="text-muted-foreground">{tiers.length ? 'ยังไม่ถึงขั้นแรก' : '—'}</span>
                            : bySalary && salary === undefined ? <span className="text-destructive">ขั้น {tier.index} · ใส่เงินเดือนก่อน</span>
                            : <>ขั้น {tier.index} · {baht(tierBonusAmount(tier, bySalary, salary ?? null))}{bySalary && <span className="block text-muted-foreground">{baht(tier.salary ?? 0)} − {baht(salary ?? 0)}</span>}{!onOrders && target !== undefined && target > 0 && got < target && <span className="block text-destructive">ยังไม่ถึงเป้า ยังไม่ได้</span>}</>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableCard>
            {!locked && active.length > 0 && <Button type="submit" size="sm">บันทึกเป้าและเงินเดือน</Button>}
          </form>
          {!locked && (
            <div className="grid gap-3 lg:grid-cols-2">
              <form action={copyTargetsAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                {hidden}
                <span className="flex-1">คัดลอกเป้าและเงินเดือนจากรอบก่อน (เฉพาะคนที่ยังไม่ตั้ง)</span>
                <Button type="submit" size="sm" variant="outline"><Copy /> คัดลอก</Button>
              </form>
              <form action={importTargetsAction} className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
                {hidden}
                <label className="block text-xs font-medium">นำเข้าจาก Excel: คัดลอก 2 คอลัมน์ (ชื่อพนักงานขาย เช่น Tip, ยอดเป้า) มาวาง
                  <textarea name="paste" rows={4} placeholder={"Sale Wit\t2500000\nSale Tip\t1500000"} className="mt-1 w-full rounded-lg border border-border bg-background p-2 font-mono text-xs" />
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
