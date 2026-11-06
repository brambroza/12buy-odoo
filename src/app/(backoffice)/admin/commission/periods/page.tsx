import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, IconLink, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { isPeriod, monthName, payRuleText, periodDates, shiftPeriod, thaiDay } from '@/lib/commission/period';
import { listRuns } from '@/lib/commission/repo';
import { isLocked } from '@/lib/commission/service';
import { RUN_STATUS_LABELS, RUN_STATUS_TONE, type CommissionRun } from '@/lib/commission/types';
import { cn } from '@/lib/utils';
import { savePeriodDatesAction, savePeriodRuleAction } from '../actions';

const PATH = '/admin/commission/periods';
const select = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm';
const input = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm';
type Search = { source?: string; period?: string; open?: string; saved?: string; error?: string };

/**
 * Period and pay settings of a company: the default rule (cut-off day, pay day) and a table of
 * periods with their dates, where one period's end, pay date and note can be set on its own.
 */
export default async function CommissionPeriodsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission('commission.view');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  if (!source) return <div className="space-y-4"><CommissionHeader ctx={ctx} path={PATH} title="ตั้งค่ารอบ / การจ่าย" showPeriod={false} /><NoSource /></div>;

  const role = user.role as Role;
  const canManage = can(role, 'commission.manage');
  const canEditDates = can(role, 'commission.run');
  const runs = new Map((await listRuns(source.id)).map((r) => [r.period, r]));
  // Two periods ahead (to plan a holiday shift) plus the recent ones, newest first.
  const newest = ctx.periods[0];
  const periods = [shiftPeriod(newest, 2), shiftPeriod(newest, 1), ...ctx.periods];
  const editing = isPeriod(params.open) ? params.open : null;
  const close = `${PATH}?${ctxQuery(ctx)}`;
  const hidden = (period: string) => (<><input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={period} /><input type="hidden" name="from" value="periods" /></>);

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="ตั้งค่ารอบ / การจ่าย" showPeriod={false}
        description="ช่วงวันที่นับเงินเข้าของแต่ละรอบ และวันจ่ายค่าคอม · ตั้งค่าตั้งต้นครั้งเดียว แล้วแก้เฉพาะรอบที่ต่างได้ (เช่น เลื่อนเพราะวันหยุด)" />
      <Notice saved={params.saved} error={params.error} />

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">ค่าตั้งต้นของ {source.name}</h2>
        <p className="text-sm text-muted-foreground">
          ตอนนี้: ตัดรอบทุกวันที่ {source.cutoffDay} (รอบ {source.cutoffDay + 1} ของเดือนก่อน – {source.cutoffDay} ของเดือนนี้) · จ่าย{payRuleText(source.payDay, source.payMonths)}
        </p>
        {canManage ? (
          <form action={savePeriodRuleAction} className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-4 sm:items-end">
            <input type="hidden" name="source" value={source.id} />
            <input type="hidden" name="period" value={ctx.period} />
            <label className="block text-xs font-medium">วันตัดรอบ
              <select name="cutoffDay" defaultValue={source.cutoffDay} className={select}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>วันที่ {d}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium">วันจ่าย
              <select name="payDay" defaultValue={source.payDay} className={select}>
                <option value={0}>สิ้นเดือน</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>วันที่ {d}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium">ของเดือน
              <select name="payMonths" defaultValue={source.payMonths} className={select}>
                {[0, 1, 2, 3, 4, 5, 6].map((m) => <option key={m} value={m}>{m === 0 ? 'เดียวกับเดือนสิ้นรอบ' : `ถัดไป ${m} เดือน`}</option>)}
              </select>
            </label>
            <div><Button type="submit">บันทึกค่าตั้งต้น</Button></div>
            <p className="text-xs text-muted-foreground sm:col-span-4">
              เช่น ตัดรอบ 20 + สิ้นเดือน + ถัดไป 1 เดือน = รอบ ต.ค. นับเงินเข้า 21 ก.ย. – 20 ต.ค. จ่าย 30 พ.ย. · เดือนที่ไม่มีวันที่เลือก (เช่น 31) จ่ายวันสิ้นเดือน ·
              เปลี่ยนวันตัดรอบไม่ได้เมื่อมีรอบที่อนุมัติแล้ว
            </p>
          </form>
        ) : <p className="mt-2 text-xs text-muted-foreground">เฉพาะผู้มีสิทธิ์ตั้งค่าค่าคอมแก้ค่าตั้งต้นได้</p>}
      </section>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>รอบ</TableHead>
              <TableHead>นับเงินเข้า</TableHead>
              <TableHead className="text-right">จำนวนวัน</TableHead>
              <TableHead>วันจ่าย</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>หมายเหตุ</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 && <EmptyRow colSpan={7}>ไม่มีรอบ</EmptyRow>}
            {periods.map((period) => {
              const d = periodDates(ctx.calendar, period);
              const run = runs.get(period);
              const days = Math.round((Date.parse(d.end) - Date.parse(d.start)) / 86_400_000) + 1;
              return (
                <TableRow key={period} data-state={editing === period ? 'selected' : undefined}>
                  <TableCell data-label="รอบ" className="font-medium">
                    <Link href={`/admin/commission/runs/${period}?${ctxQuery({ source, period })}`} className="hover:underline">{monthName(period)}</Link>
                  </TableCell>
                  <TableCell data-label="นับเงินเข้า" className="text-sm">
                    <span className={cn(d.customStart && 'text-amber-700')}>{thaiDay(d.start)}</span> – <span className={cn(d.customEnd && 'text-amber-700')}>{thaiDay(d.end)}</span>
                    {(d.customStart || d.customEnd) && <Badge variant="outline" className="ml-2 border-transparent bg-amber-500/15 text-amber-800">กำหนดเอง</Badge>}
                  </TableCell>
                  <TableCell data-label="จำนวนวัน" className="text-right tabular-nums">{days}</TableCell>
                  <TableCell data-label="วันจ่าย" className="text-sm">
                    <span className={cn(d.customPay && 'text-amber-700')}>{thaiDay(d.payDate)}</span>
                    {d.customPay && <Badge variant="outline" className="ml-2 border-transparent bg-amber-500/15 text-amber-800">กำหนดเอง</Badge>}
                  </TableCell>
                  <TableCell data-label="สถานะ">
                    {run ? <Badge variant="outline" className={`border-transparent ${RUN_STATUS_TONE[run.status]}`}>{RUN_STATUS_LABELS[run.status]}</Badge> : <span className="text-xs text-muted-foreground">ยังไม่เปิดรอบ</span>}
                  </TableCell>
                  <TableCell data-label="หมายเหตุ" className="max-w-56 text-xs whitespace-normal text-muted-foreground">{d.note ?? ''}</TableCell>
                  <TableCell>
                    {canEditDates && run?.status !== 'PAID' && <IconLink href={`${PATH}?${ctxQuery(ctx, { open: period })}`} label={`แก้วันที่รอบ ${monthName(period)}`}><Pencil /></IconLink>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <p className="text-xs text-muted-foreground">วันเริ่มของแต่ละรอบ = วันถัดจากวันสิ้นสุดของรอบก่อน จึงไม่มีวันซ้ำหรือตกหล่น · ตัวสีส้ม = ต่างจากค่าตั้งต้น · แก้ช่วงวันหลังดึงข้อมูลแล้ว ต้องกดดึงข้อมูลรอบนั้นใหม่</p>

      {editing && canEditDates && (
        <PeriodDrawer period={editing} ctx={ctx} run={runs.get(editing) ?? null} nextRun={runs.get(shiftPeriod(editing, 1)) ?? null} hidden={hidden(editing)} closeHref={close} />
      )}
    </div>
  );
}

/** Edits one period's end, pay date and note; the end is fixed once this period or the next is approved. */
function PeriodDrawer({ period, ctx, run, nextRun, hidden, closeHref }: {
  period: string; ctx: Awaited<ReturnType<typeof commissionContext>>; run: CommissionRun | null; nextRun: CommissionRun | null; hidden: ReactNode; closeHref: string;
}) {
  const d = periodDates(ctx.calendar, period);
  const endLocked = isLocked(run) || isLocked(nextRun);
  const next = periodDates(ctx.calendar, shiftPeriod(period, 1));
  return (
    <UrlDrawer title={`วันที่รอบ ${monthName(period)}`} description={`ตอนนี้ ${thaiDay(d.start)} – ${thaiDay(d.end)} · จ่าย ${thaiDay(d.payDate)}`} closeHref={closeHref}>
      <form action={savePeriodDatesAction} className="grid max-w-md gap-3">
        {hidden}
        <label className="block text-xs font-medium">วันเริ่ม (ตามวันสิ้นสุดของรอบก่อน)
          <input type="date" value={d.start} disabled className={cn(input, 'bg-muted')} />
        </label>
        <label className="block text-xs font-medium">วันสิ้นสุด
          <input type="date" name="endDate" defaultValue={d.end} required disabled={endLocked} className={input} />
          {endLocked && <input type="hidden" name="endDate" value={d.end} />}
          <span className="mt-1 block font-normal text-muted-foreground">
            {endLocked ? 'รอบนี้หรือรอบถัดไปอนุมัติแล้ว แก้วันสิ้นสุดไม่ได้' : `รอบถัดไป (${monthName(shiftPeriod(period, 1))}) จะเริ่มวันถัดจากวันนี้ ตอนนี้สิ้นสุด ${thaiDay(next.end)}`}
          </span>
        </label>
        <label className="block text-xs font-medium">วันจ่าย
          <input type="date" name="payDate" defaultValue={d.payDate} required className={input} />
        </label>
        <label className="block text-xs font-medium">หมายเหตุ
          <input name="note" defaultValue={d.note ?? ''} maxLength={200} placeholder="เช่น เลื่อนเพราะหยุดปีใหม่" className={input} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">บันทึก</Button>
          {(d.customEnd || d.customPay) && <Button type="submit" variant="outline" name="reset" value="1" formNoValidate>ใช้ค่าตั้งต้น</Button>}
        </div>
      </form>
    </UrlDrawer>
  );
}
