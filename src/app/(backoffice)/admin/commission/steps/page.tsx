import { AlertTriangle, CalendarX2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { isValidOn, stepProblems } from '@/lib/commission/calc';
import { commissionContext } from '@/lib/commission/context';
import { periodDates, thaiDay, todayBangkok } from '@/lib/commission/period';
import { listSteps } from '@/lib/commission/repo';
import { createStepAction, endOrDeleteStepAction } from '../actions';

const PATH = '/admin/commission/steps';
const label = 'block text-xs font-medium';
const input = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal';
type Search = { source?: string; period?: string; saved?: string; error?: string };

/**
 * Pay-out steps by days the customer paid after the invoice due date (from the cash date).
 * Paying on or before the due date counts as 0 days; beyond the last step pays 0%.
 */
export default async function CommissionStepsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const today = todayBangkok();
  // New steps start on the first day of the selected period, so they cover cash already in it.
  const periodStart = ctx.source ? periodDates(ctx.calendar, ctx.period).start : today;
  const steps = ctx.source ? await listSteps(ctx.source.id) : [];
  const current = steps.filter((s) => isValidOn(s, today));
  const problems = stepProblems(current);
  const last = [...current].sort((a, b) => a.minDays - b.minDays).at(-1);
  const hidden = ctx.source && (<><input type="hidden" name="source" value={ctx.source.id} /><input type="hidden" name="period" value={ctx.period} /></>);

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="ขั้นบันไดเกินดิว" showPeriod={false}
        description="% ที่จ่ายจากค่าคอมพื้นฐาน ตามจำนวนวันที่เงินเข้าหลังวันครบกำหนดของใบแจ้งหนี้ (จ่ายก่อน/ตรงดิว = 0 วัน) · ไม่ได้ตั้งขั้นบันไดที่มีผลวันเงินเข้า = คิด 100% · ตั้งแล้วแต่เกินขั้นสุดท้าย = 0%" />
      <Notice saved={params.saved} error={params.error} />
      {!ctx.source ? <NoSource /> : (
        <>
          {problems.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800">
              {problems.map((p) => <li key={p} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {p}</li>)}
            </ul>
          )}
          {last && last.maxDays !== null && <p className="text-sm text-muted-foreground">เกินดิวมากกว่า {last.maxDays} วัน ได้ 0%</p>}
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>เกินดิว (วัน)</TableHead>
                  <TableHead className="text-right">จ่าย</TableHead>
                  <TableHead>มีผล</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {steps.length === 0 && <EmptyRow colSpan={4}>ยังไม่มีขั้นบันได (ทุกบิลคิด 100% ไม่ว่าจ่ายช้าเท่าไร) เพิ่มด้านล่าง หรือสร้างค่าเริ่มต้นที่หน้าอัตราค่าคอม</EmptyRow>}
                {steps.map((s) => (
                  <TableRow key={s.id} className={isValidOn(s, today) ? undefined : 'opacity-60'}>
                    <TableCell data-label="เกินดิว" className="font-medium">{s.minDays}{s.maxDays === null ? ' วันขึ้นไป' : ` – ${s.maxDays} วัน`}</TableCell>
                    <TableCell data-label="จ่าย" className="text-right font-semibold tabular-nums">{s.percent}%</TableCell>
                    <TableCell data-label="มีผล" className="text-xs">{thaiDay(s.validFrom)} – {s.validTo ? thaiDay(s.validTo) : 'ไม่กำหนด'}</TableCell>
                    <TableCell>
                      <span className="flex items-center justify-end gap-1">
                        {!s.validTo && (
                          <form action={endOrDeleteStepAction} className="flex items-center gap-1">
                            {hidden}<input type="hidden" name="id" value={s.id} />
                            <input name="validTo" type="date" defaultValue={today} aria-label="สิ้นสุดวันที่" className="h-8 w-36 rounded-lg border border-border bg-background px-1 text-xs" />
                            <IconSubmit label="สิ้นสุดขั้นนี้ในวันที่เลือก"><CalendarX2 /></IconSubmit>
                          </form>
                        )}
                        <form action={endOrDeleteStepAction}>
                          {hidden}<input type="hidden" name="id" value={s.id} /><input type="hidden" name="delete" value="1" />
                          <IconSubmit label="ลบขั้น" tone="danger" confirm="ลบขั้นนี้?"><Trash2 /></IconSubmit>
                        </form>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          <form action={createStepAction} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
            {hidden}
            <h2 className="text-sm font-semibold sm:col-span-3 lg:col-span-6">เพิ่มขั้น</h2>
            <label className={label}>ตั้งแต่ (วัน)<input name="minDays" type="number" min={0} step={1} required className={input} /></label>
            <label className={label}>ถึง (ว่าง = ไม่จำกัด)<input name="maxDays" type="number" min={0} step={1} className={input} /></label>
            <label className={label}>จ่าย %<input name="percent" type="number" min={0} max={500} step="0.01" required placeholder="100" className={input} /></label>
            <label className={label}>เริ่มใช้<input name="validFrom" type="date" required defaultValue={periodStart} className={input} /></label>
            <label className={label}>สิ้นสุด<input name="validTo" type="date" className={input} /></label>
            <div className="flex items-end"><Button type="submit" size="sm">เพิ่มขั้น</Button></div>
          </form>
        </>
      )}
    </div>
  );
}
