import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, CalendarDays, Calculator, CheckCircle2, Download, FileText, RefreshCw, Send, Trash2, Undo2, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { StepTable } from '@/components/admin/commission-statement';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { requirePermission } from '@/lib/auth/session';
import { findUserById } from '@/lib/auth/users';
import { blockingIssues, excludedReasonOf } from '@/lib/commission/calc';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { isPeriod, periodDates, periodLabel, shiftPeriod, thaiDay, type PeriodCalendar } from '@/lib/commission/period';
import { getRun, listAdjustments, listLedger, listReps } from '@/lib/commission/repo';
import { EXCLUDED_LABELS, OWNER_FROM_LABELS, PAYMENT_KIND_LABELS, RUN_STATUS_LABELS, RUN_STATUS_TONE, type RepResult, type RunResults } from '@/lib/commission/types';
import { baht } from '@/lib/shop/catalog';
import { cn } from '@/lib/utils';
import { addAdjustmentAction, calculateAction, deleteAdjustmentAction, runStepAction, savePeriodDatesAction, syncPeriodAction } from '../../actions';

type Search = { source?: string; rep?: string; show?: string; saved?: string; error?: string };
const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/**
 * One period's commission run: pull from Odoo, calculate, review per rep (drill down to every
 * invoice line with the rate, special-price % and overdue step used), adjust with a reason,
 * submit, approve by another person (locks the run), mark paid, export.
 */
export default async function CommissionRunPage({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<Search> }) {
  const user = await requirePermission('commission.view');
  const [{ period }, sp] = await Promise.all([params, searchParams]);
  if (!isPeriod(period)) notFound();
  const ctx = await commissionContext({ source: sp.source, period });
  const source = ctx.source;
  const path = `/admin/commission/runs/${period}`;
  if (!source) return <div className="space-y-4"><CommissionHeader ctx={ctx} path={path} title="รอบค่าคอม" /><NoSource /></div>;

  const role = user.role as Role;
  const [run, reps] = await Promise.all([getRun(source.id, period), listReps(source.id)]);
  const [adjustments, ledger, submittedBy, approvedBy] = await Promise.all([
    run ? listAdjustments(run.id) : Promise.resolve([]),
    sp.rep ? listLedger(source.id, period) : Promise.resolve([]),
    run?.submittedById ? findUserById(run.submittedById) : null,
    run?.approvedById ? findUserById(run.approvedById) : null,
  ]);
  const results = run?.results ?? null;
  const status = run?.status ?? 'DRAFT';
  const hidden = (<><input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={period} /></>);
  const blocking = results ? blockingIssues(results) : [];
  const issueCounts = new Map<string, number>();
  for (const i of results?.issues ?? []) issueCounts.set(i.message, (issueCounts.get(i.message) ?? 0) + 1);
  const repName = new Map(reps.map((r) => [r.odooUserId, r.name]));
  const drillRep = sp.rep ? Number(sp.rep) : null;
  const lineResults = new Map((results?.lines ?? []).map((l) => [l.lineKey, l]));
  const repLines = drillRep !== null ? ledger.filter((l) => l.odooUserId === drillRep) : [];
  const show = sp.show === 'counted' || sp.show === 'excluded' ? sp.show : 'all';
  const drillLines = repLines.filter((l) => show === 'all' || (excludedReasonOf(l, lineResults.get(l.lineKey)) === null) === (show === 'counted'));
  const drillCredits = drillRep !== null ? (results?.credits ?? []).filter((c) => c.odooUserId === drillRep) : [];
  const drillResult = drillRep !== null ? results?.reps.find((r) => r.odooUserId === drillRep) : undefined;
  const close = `${path}?${ctxQuery(ctx)}`;
  const dates = periodDates(ctx.calendar, period);
  const step = (name: string, label: string, icon: ReactNode, variant: 'default' | 'outline' = 'default') => (
    <form action={runStepAction}>{hidden}<input type="hidden" name="step" value={name} />
      <Button type="submit" size="sm" variant={variant}>{icon} {label}</Button>
    </form>
  );

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={path} title={`รอบค่าคอม ${periodLabel(period, ctx.calendar)}`}
        description={<>จ่าย {thaiDay(dates.payDate)} · <Badge variant="outline" className={`border-transparent ${RUN_STATUS_TONE[status]}`}>{RUN_STATUS_LABELS[status]}</Badge></>}
        actions={results && (
          <>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`${path}/statement?${ctxQuery(ctx)}`} />}><FileText /> ใบสรุปรายคน</Button>
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/admin/commission/export?${ctxQuery(ctx, { kind: 'statement' })}`} />}><Download /> ใบสรุป Excel</Button>
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/admin/commission/export?${ctxQuery(ctx, { kind: 'run' })}`} />}><Download /> สรุปต่อคน</Button>
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/admin/commission/export?${ctxQuery(ctx, { kind: 'run-lines' })}`} />}><Download /> รายบรรทัด</Button>
          </>
        )} />
      <Notice saved={sp.saved} error={sp.error} />

      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
        {status === 'DRAFT' && can(role, 'commission.run') && (
          <>
            <form action={syncPeriodAction}>{hidden}<Button type="submit" size="sm" variant="outline"><RefreshCw /> 1. ดึงข้อมูลจาก Odoo</Button></form>
            <form action={calculateAction}>{hidden}<Button type="submit" size="sm" variant="outline" disabled={!run?.syncedAt}><Calculator /> 2. คำนวณ</Button></form>
            {step('submit', '3. ส่งอนุมัติ', <Send />)}
          </>
        )}
        {status === 'PENDING_APPROVAL' && can(role, 'commission.approve') && (
          <>
            {run?.submittedById === user.id
              ? <span className="text-amber-700">คุณเป็นผู้ส่ง ให้ผู้อนุมัติคนอื่นเข้าสู่ระบบเพื่ออนุมัติ</span>
              : step('approve', 'อนุมัติ (ล็อกรอบ)', <CheckCircle2 />)}
            {step('reject', 'ตีกลับเป็นร่าง', <Undo2 />, 'outline')}
          </>
        )}
        {status === 'APPROVED' && can(role, 'commission.approve') && step('paid', 'บันทึกว่าจ่ายแล้ว', <Wallet />)}
        <span className="ml-auto text-xs text-muted-foreground">
          {run?.syncedAt ? `ดึงข้อมูล ${fmt.format(run.syncedAt)}` : 'ยังไม่ได้ดึงข้อมูล'}{run?.calculatedAt ? ` · คำนวณ ${fmt.format(run.calculatedAt)}` : ''}
          {submittedBy ? ` · ส่งโดย ${submittedBy.name}` : ''}{approvedBy ? ` · อนุมัติโดย ${approvedBy.name} ${run?.approvedAt ? fmt.format(run.approvedAt) : ''}` : ''}
        </span>
      </section>
      {run?.syncedAt && run.calculatedAt === null && status === 'DRAFT' && <p className="text-sm text-amber-700">ข้อมูลเปลี่ยนหลังคำนวณครั้งก่อน กด “คำนวณ” ใหม่</p>}
      {run?.syncedAt && datesChangedSince(ctx.calendar, period, run.syncedAt) && status !== 'APPROVED' && status !== 'PAID' && (
        <p className="text-sm text-amber-700">ช่วงวันของรอบเปลี่ยนหลังดึงข้อมูลครั้งก่อน กด “1. ดึงข้อมูลจาก Odoo” ใหม่</p>
      )}
      <PeriodDatesCard calendar={ctx.calendar} period={period} hidden={hidden} canEdit={can(role, 'commission.run') && status !== 'PAID'} endLocked={status === 'APPROVED' || status === 'PAID'} />

      {results && (
        <>
          <RunSummary results={results} />

          {issueCounts.size > 0 && (
            <details className="rounded-xl border border-amber-300 bg-amber-500/5 p-3 text-sm" open={blocking.length > 0}>
              <summary className="flex cursor-pointer items-center gap-2 font-medium text-amber-800"><AlertTriangle className="size-4" /> รายการตรวจสอบ ({results.issues.length})</summary>
              <ul className="mt-2 space-y-1">
                {[...issueCounts.entries()].map(([message, count]) => <li key={message} className={cn(message.startsWith('ยังไม่ได้ตั้งเป้า') && 'font-semibold text-destructive')}>{message}{count > 1 ? ` × ${count}` : ''}</li>)}
              </ul>
              <Link href={`/admin/commission/collections?${ctxQuery(ctx, { issues: '1' })}`} className="mt-2 inline-block text-xs text-primary underline">ดูรายการเงินเข้าที่ต้องตรวจ</Link>
            </details>
          )}

          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>พนักงานขาย</TableHead>
                  <TableHead className="text-right">ยอดเก็บ ก่อน VAT</TableHead>
                  <TableHead>ไม่นำมาคิด เพราะ</TableHead>
                  <TableHead className="text-right">เป้า</TableHead>
                  <TableHead className="text-right">ค่าคอม</TableHead>
                  <TableHead className="text-right">หัก / ปรับ</TableHead>
                  <TableHead className="text-right">จ่ายจริง</TableHead>
                  <TableHead className="text-right">CN รอบนี้ (ไม่หัก)</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.reps.length === 0 && <EmptyRow colSpan={9}>ไม่มีพนักงานที่มียอดในรอบนี้</EmptyRow>}
                {results.reps.map((r) => {
                  const drill = (extra: Record<string, string> = {}) => `${path}?${ctxQuery(ctx, { rep: String(r.odooUserId), ...extra })}`;
                  const excludedBase = (r.excluded ?? []).reduce((sum, e) => sum + e.base, 0);
                  return (
                    <TableRow key={r.odooUserId}>
                      <TableCell data-label="พนักงานขาย"><Link href={drill()} scroll={false} className="font-medium text-primary hover:underline">{r.repName}</Link><span className="block text-xs text-muted-foreground">{r.lines} บรรทัด · กดเพื่อดูทีละบิล</span></TableCell>
                      <TableCell data-label="ยอดเก็บ" className="text-right tabular-nums">
                        {baht(r.base)}
                        {r.counted !== undefined && <span className="block text-xs text-emerald-700">นำมาคิด {baht(r.counted)}</span>}
                      </TableCell>
                      <TableCell data-label="ไม่นำมาคิด" className="text-xs whitespace-normal">
                        {!r.excluded?.length ? <span className="text-muted-foreground">—</span> : (
                          <Link href={drill({ show: 'excluded' })} scroll={false} className="block hover:underline">
                            <span className="font-medium text-amber-800">{baht(excludedBase)}</span>
                            {r.excluded.map((e) => <span key={e.reason} className="block text-muted-foreground">{EXCLUDED_LABELS[e.reason]} {baht(e.base)} ({e.lines} บรรทัด)</span>)}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell data-label="เป้า" className="text-right text-xs tabular-nums">
                        {r.target === null ? <span className="text-destructive">ยังไม่ตั้ง</span> : r.target === 0 ? 'ไม่ใช้เป้า' : <>{baht(r.target)}<span className={cn('block', r.targetMet ? 'text-emerald-700' : 'text-destructive')}>{r.targetMet ? 'ถึงเป้า' : `ไม่ถึงเป้า ขาด ${baht(r.target - r.base)}`}</span></>}
                      </TableCell>
                      <TableCell data-label="ค่าคอม" className="text-right tabular-nums">
                        {baht(r.commission)}
                        {r.commissionBeforeTarget !== undefined && r.commissionBeforeTarget !== r.commission && <span className="block text-xs text-destructive">ถ้าถึงเป้าจะได้ {baht(r.commissionBeforeTarget)}</span>}
                        {r.debtRelease ? <span className="block text-xs text-emerald-700">คืนลูกหนี้ +{baht(r.debtRelease)}</span> : null}
                        {r.tierBonus ? <span className="block text-xs text-emerald-700">เงินพิเศษขั้น {r.tier?.index} +{baht(r.tierBonus)}</span> : null}
                        {r.newCustomers?.length ? <span className={cn('block text-xs', r.newCustomerBonus ? 'text-emerald-700' : 'text-muted-foreground')}>ลูกค้าใหม่ {r.newCustomers.length} ราย +{baht(r.newCustomerBonus ?? 0)}</span> : null}
                      </TableCell>
                      <TableCell data-label="หัก / ปรับ" className="text-right text-xs tabular-nums">
                        {r.central ? <span className="block text-destructive">ส่วนกลาง {r.centralPercent}% {baht(-r.central)}</span> : null}
                        {r.debtHold ? <span className="block text-destructive">ลูกหนี้ค้าง {baht(-r.debtHold)}</span> : null}
                        {r.adjustments ? <span className="block">ปรับ {baht(r.adjustments)}</span> : null}
                        {r.carryIn ? <span className="block text-destructive">ยกมา {baht(r.carryIn)}</span> : null}
                        {!r.central && !r.debtHold && !r.adjustments && !r.carryIn && '—'}
                      </TableCell>
                      <TableCell data-label="จ่ายจริง" className="text-right font-semibold tabular-nums">{baht(r.payable)}{r.carryOut < 0 && <span className="block text-xs font-normal text-destructive">ยกไปหัก {baht(r.carryOut)}</span>}</TableCell>
                      <TableCell data-label="CN" className="text-right text-xs tabular-nums">{r.creditNoteCount ? <Link href={drill()} scroll={false} className="hover:underline">{baht(r.creditNoteBase ?? 0)}<span className="block text-muted-foreground">{r.creditNoteCount} ใบ</span></Link> : '—'}</TableCell>
                      <TableCell>
                        <Link href={`${path}/statement?${ctxQuery(ctx, { rep: String(r.odooUserId) })}`} title="ใบสรุปค่าคอม" aria-label={`ใบสรุปค่าคอมของ ${r.repName}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><FileText className="size-4" /></Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
          <p className="text-xs text-muted-foreground">
            ยอดเก็บ = เงินลูกค้าเข้าบัญชีในรอบนี้ (ก่อน VAT) · ค่าคอม = ยอดที่นำมาคิด × อัตรา × % ราคาพิเศษ × % ขั้นบันไดเกินดิว ·
            CN ไม่หักค่าคอมซ้ำ เพราะบิลที่ถูกลดหนี้จะเก็บเงินได้น้อยลงเองอยู่แล้ว
          </p>
        </>
      )}

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">รายการปรับยอด (มีผลเมื่อคำนวณใหม่)</h2>
        {adjustments.length === 0 && <p className="text-sm text-muted-foreground">ไม่มี</p>}
        <ul className="divide-y divide-border text-sm">
          {adjustments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1">{repName.get(a.odooUserId) ?? `#${a.odooUserId}`} · <span className={cn('tabular-nums', a.amount < 0 && 'text-destructive')}>{baht(a.amount)}</span> · <span className="text-muted-foreground">{a.reason}</span></span>
              {status === 'DRAFT' && can(role, 'commission.run') && (
                <form action={deleteAdjustmentAction}>{hidden}<input type="hidden" name="id" value={a.id} /><IconSubmit label="ลบรายการปรับ" tone="danger" confirm="ลบรายการปรับนี้?"><Trash2 /></IconSubmit></form>
              )}
            </li>
          ))}
        </ul>
        {status === 'DRAFT' && can(role, 'commission.run') && reps.length > 0 && (
          <form action={addAdjustmentAction} className="flex flex-wrap items-end gap-2 text-sm">
            {hidden}
            <select name="odooUserId" required aria-label="พนักงานขาย" className="h-9 rounded-lg border border-border bg-background px-2">
              <option value="">— พนักงานขาย —</option>
              {reps.map((r) => <option key={r.id} value={r.odooUserId}>{r.name}</option>)}
            </select>
            <input name="amount" type="number" step="0.01" required placeholder="+500 หรือ -200" aria-label="จำนวนเงิน" className="h-9 w-36 rounded-lg border border-border bg-background px-2 text-right" />
            <input name="reason" required maxLength={300} placeholder="เหตุผล (บังคับ)" aria-label="เหตุผล" className="h-9 min-w-56 flex-1 rounded-lg border border-border bg-background px-2" />
            <Button type="submit" size="sm" variant="outline">เพิ่มรายการปรับ</Button>
          </form>
        )}
      </section>

      {drillRep !== null && (
        <UrlDrawer title={`${repName.get(drillRep) ?? drillResult?.repName ?? `#${drillRep}`} · รายละเอียดรอบ ${period}`} closeHref={close} size="xl">
          {drillResult && <RepExplain rep={drillResult} />}
          {drillResult && <StepTable rep={drillResult} />}
          <nav className="flex flex-wrap gap-1 text-xs" aria-label="กรองรายการ">
            {([['all', `ทั้งหมด (${repLines.length})`], ['counted', 'นำมาคิดค่าคอม'], ['excluded', 'ไม่นำมาคิด']] as const).map(([key, text]) => (
              <Link key={key} href={`${path}?${ctxQuery(ctx, { rep: String(drillRep), show: key === 'all' ? undefined : key })}`} scroll={false}
                className={cn('rounded-full border px-3 py-1', show === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>{text}</Link>
            ))}
          </nav>
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>เงินเข้า / ใบแจ้งหนี้</TableHead>
                  <TableHead>สินค้า</TableHead>
                  <TableHead>Pricelist</TableHead>
                  <TableHead className="text-right">หน่วย</TableHead>
                  <TableHead className="text-right">ก่อน VAT</TableHead>
                  <TableHead className="text-right">อัตรา × พิเศษ × ขั้น</TableHead>
                  <TableHead className="text-right">ค่าคอม</TableHead>
                  <TableHead>ผล</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillLines.length === 0 && <EmptyRow colSpan={8}>ไม่มีรายการ</EmptyRow>}
                {drillLines.map((l) => {
                  const r = lineResults.get(l.lineKey);
                  return (
                    <TableRow key={l.id} className={cn(l.kind === 'RETRO' && 'bg-amber-500/5')}>
                      <TableCell data-label="เงินเข้า" className="text-xs whitespace-normal">{thaiDay(l.cashDate)} · {l.receiptName}<span className="block text-muted-foreground">{l.invoiceName} · ดิว {thaiDay(l.dueDate)} · เกิน {l.overdueDays ?? 0} วัน · {PAYMENT_KIND_LABELS[l.paymentKind] ?? ''} · เจ้าของจาก{OWNER_FROM_LABELS[l.ownerFrom]}</span></TableCell>
                      <TableCell data-label="สินค้า" className="text-xs whitespace-normal">{l.productName}<span className="block text-muted-foreground">{[l.brand, l.family].filter(Boolean).join('-')}</span></TableCell>
                      <TableCell data-label="Pricelist" className="text-xs">{l.pricelistName ?? '—'}</TableCell>
                      <TableCell data-label="หน่วย" className="text-right text-xs tabular-nums">{l.qty}</TableCell>
                      <TableCell data-label="ก่อน VAT" className="text-right tabular-nums">{baht(l.base)}</TableCell>
                      <TableCell data-label="อัตรา" className="text-right text-xs tabular-nums">{r ? `${r.rateLabel} × ${r.specialPercent}% × ${r.stepPercent}%` : 'ยังไม่คำนวณ'}</TableCell>
                      <TableCell data-label="ค่าคอม" className="text-right font-semibold tabular-nums">{r ? baht(r.commission) : '—'}</TableCell>
                      <TableCell data-label="ผล" className="text-xs whitespace-normal">
                        {(() => {
                          if (!r) return '—';
                          const reason = excludedReasonOf(l, r);
                          return reason ? <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-800">ไม่คิด: {EXCLUDED_LABELS[reason]}</Badge> : <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-800">นำมาคิด</Badge>;
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
          {drillCredits.length > 0 && (
            <section className="space-y-1 text-sm">
              <h3 className="font-semibold">ใบลดหนี้ (CN) ที่ออกรอบนี้ · แสดงให้ทราบ ไม่หักค่าคอม</h3>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {drillCredits.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5 text-xs">
                    <span className="font-medium">{c.name}</span><span>{thaiDay(c.date)}</span><span className="flex-1 text-muted-foreground">{c.partnerName}{c.originName ? ` · ลดหนี้บิล ${c.originName}` : ''}</span>
                    <span className="tabular-nums">ก่อน VAT {baht(c.base)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </UrlDrawer>
      )}
    </div>
  );
}

const sumOf = (reps: RepResult[], pick: (r: RepResult) => number) => reps.reduce((sum, r) => sum + pick(r), 0);

/**
 * The period in plain words, top to bottom: cash in, what was counted and what was not (and why),
 * commission, deductions, what is paid, and the credit notes shown for reference.
 */
function RunSummary({ results }: { results: RunResults }) {
  const reps = results.reps;
  const collected = sumOf(reps, (r) => r.base) + results.unassignedBase;
  const counted = sumOf(reps, (r) => r.counted ?? r.base);
  const excluded = new Map<string, number>();
  for (const r of reps) for (const e of r.excluded ?? []) excluded.set(EXCLUDED_LABELS[e.reason], (excluded.get(EXCLUDED_LABELS[e.reason]) ?? 0) + e.base);
  if (results.unassignedBase) excluded.set('ไม่มีพนักงานขายเจ้าของบิล', results.unassignedBase);
  const before = sumOf(reps, (r) => r.commissionBeforeTarget ?? r.commission);
  const commission = sumOf(reps, (r) => r.commission);
  const deducted = sumOf(reps, (r) => r.central + r.debtHold);
  const other = sumOf(reps, (r) => r.adjustments + r.carryIn + r.debtRelease);
  const bonus = sumOf(reps, (r) => (r.tierBonus ?? 0) + (r.newCustomerBonus ?? 0));
  const credits = results.credits ?? [];
  const row = (label: string, value: number, tone?: 'muted' | 'bad' | 'good' | 'strong', note?: string) => (
    <li className={cn('flex items-baseline gap-2 py-1', tone === 'strong' && 'border-t border-border pt-2 font-bold')}>
      <span className={cn('flex-1', tone === 'muted' && 'pl-4 text-muted-foreground')}>{label}{note && <span className="block text-xs font-normal text-muted-foreground">{note}</span>}</span>
      <span className={cn('tabular-nums', tone === 'bad' && 'text-destructive', tone === 'good' && 'text-emerald-700')}>{baht(value)}</span>
    </li>
  );
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="mb-1 font-semibold">สรุปรอบนี้ (ก่อน VAT)</h2>
        <ul>
          {row('เงินลูกค้าเข้าบัญชีในรอบนี้', collected)}
          {row('นำมาคิดค่าคอม', counted, 'good')}
          {[...excluded].map(([label, value]) => row(`ไม่นำมาคิด: ${label}`, value, 'muted'))}
          {results.notInvoiceGross ? row('เงินเข้าที่ไม่ใช่ค่าบิล (มัดจำ/ปรับปรุง) รวม VAT', results.notInvoiceGross, 'muted', 'ไม่คิดค่าคอม') : null}
          {row('ค่าคอมตามอัตรา', before)}
          {before !== commission && row('ไม่ได้เพราะไม่ถึงเป้า', commission - before, 'bad')}
          {deducted ? row('หัก ส่วนกลาง / ลูกหนี้ค้างชำระ', -deducted, 'bad') : null}
          {bonus ? row('บวก เงินพิเศษตามขั้นยอดเก็บ / ลูกค้าใหม่', bonus, 'good') : null}
          {other ? row('ปรับปรุง / คืนลูกหนี้ / ยกมา', other) : null}
          {row('ค่าคอมที่ต้องจ่าย', results.totalPayable, 'strong', `${reps.filter((r) => r.payable > 0).length} คน`)}
        </ul>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="mb-1 font-semibold">ใบลดหนี้ (CN) และเงินคืนลูกค้า · แสดงให้ทราบ ไม่หักค่าคอม</h2>
        <ul>
          {row(`CN ที่ออกในรอบนี้ ${credits.length} ใบ`, credits.reduce((sum, c) => sum + c.base, 0))}
          {credits.some((c) => c.odooUserId === null) && row('CN ที่ไม่มีพนักงานขาย', credits.filter((c) => c.odooUserId === null).reduce((sum, c) => sum + c.base, 0), 'muted')}
          {row(`เงินคืนลูกค้า ${results.refunds?.count ?? 0} รายการ (รวม VAT)`, results.refunds?.amount ?? 0)}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {results.credits === undefined ? 'ยังไม่มีข้อมูล CN กด “คำนวณ” ใหม่เพื่อดึงจาก Odoo · ' : ''}
          ค่าคอมคิดจากเงินที่เข้าบัญชีจริง บิลที่ถูกลดด้วย CN จึงมียอดเก็บน้อยลงเอง ไม่ต้องหักซ้ำ ถ้าต้องหักเพิ่มใช้ “รายการปรับยอด” พร้อมเหตุผล
        </p>
      </div>
    </section>
  );
}

/** One rep's figures as a sentence chain, at the top of the per-invoice view. */
function RepExplain({ rep }: { rep: RepResult }) {
  const excludedBase = (rep.excluded ?? []).reduce((sum, e) => sum + e.base, 0);
  return (
    <p className="rounded-xl bg-muted/60 p-3 text-sm leading-relaxed">
      เก็บเงินได้ <b>{baht(rep.base)}</b> นำมาคิด <b className="text-emerald-700">{baht(rep.counted ?? rep.base)}</b>
      {excludedBase > 0 && <> ไม่คิด <b className="text-amber-800">{baht(excludedBase)}</b> ({(rep.excluded ?? []).map((e) => `${EXCLUDED_LABELS[e.reason]} ${baht(e.base)}`).join(', ')})</>}
      {' '}ได้ค่าคอมตามอัตรา <b>{baht(rep.commissionBeforeTarget ?? rep.commission)}</b>
      {rep.commissionBeforeTarget !== undefined && rep.commissionBeforeTarget !== rep.commission && <span className="text-destructive"> แต่ไม่ถึงเป้า {baht(rep.target ?? 0)} จึงได้ {baht(rep.commission)}</span>}
      {rep.central > 0 && <> หักส่วนกลาง {baht(rep.central)}</>}
      {rep.debtHold > 0 && <> หักลูกหนี้ค้าง {baht(rep.debtHold)}</>}
      {rep.tierBonus ? <> บวกเงินพิเศษขั้น {rep.tier?.index} {baht(rep.tierBonus)}</> : null}
      {rep.newCustomerBonus ? <> บวกลูกค้าใหม่ {rep.newCustomers?.length} ราย {baht(rep.newCustomerBonus)}</> : null}
      {rep.adjustments !== 0 && <> ปรับ {baht(rep.adjustments)}</>}
      {' '}จ่ายจริง <b>{baht(rep.payable)}</b>
      {rep.creditNoteCount ? <span className="text-muted-foreground"> · CN รอบนี้ {rep.creditNoteCount} ใบ {baht(rep.creditNoteBase ?? 0)} (ไม่หัก)</span> : null}
    </p>
  );
}

/** True when this period's dates (its own end / pay date, or the previous period's end) were changed after `since`. */
function datesChangedSince(calendar: PeriodCalendar, period: string, since: Date): boolean {
  const previous = shiftPeriod(period, -1);
  return calendar.overrides.some((o) => (o.period === period || (o.period === previous && o.endDate)) && o.updatedAt && new Date(o.updatedAt) > since);
}

/**
 * The period's start, end and pay date. End and pay date follow the company rule unless set here;
 * the start is always the day after the previous period's end, so periods never overlap.
 */
function PeriodDatesCard({ calendar, period, hidden, canEdit, endLocked }: { calendar: PeriodCalendar; period: string; hidden: ReactNode; canEdit: boolean; endLocked: boolean }) {
  const dates = periodDates(calendar, period);
  const input = 'h-9 rounded-lg border border-border bg-background px-2 text-sm';
  const tag = (custom: boolean) => <span className={cn('ml-1 text-xs font-normal', custom ? 'text-amber-700' : 'text-muted-foreground')}>{custom ? '(กำหนดเอง)' : '(ตามค่าตั้งต้น)'}</span>;
  return (
    <details className="rounded-xl border border-border bg-card p-3 text-sm" open={dates.customEnd || dates.customPay || dates.customStart}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 font-medium"><CalendarDays className="size-4" /> วันที่ของรอบ</span>
        <span>เงินเข้า {thaiDay(dates.start)} – {thaiDay(dates.end)}</span>
        <span>จ่าย {thaiDay(dates.payDate)}</span>
        {(dates.customEnd || dates.customPay || dates.customStart) && <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-800">กำหนดเอง</Badge>}
      </summary>
      <form action={savePeriodDatesAction} className="mt-3 flex flex-wrap items-end gap-3">
        {hidden}
        <label className="grid gap-1 text-xs font-medium">วันเริ่ม{tag(dates.customStart)}
          <input type="date" value={dates.start} disabled className={cn(input, 'bg-muted')} aria-describedby="start-hint" />
        </label>
        <label className="grid gap-1 text-xs font-medium">วันสิ้นสุด{tag(dates.customEnd)}
          <input type="date" name="endDate" defaultValue={dates.end} required disabled={!canEdit || endLocked} className={input} />
          {endLocked && <input type="hidden" name="endDate" value={dates.end} />}
        </label>
        <label className="grid gap-1 text-xs font-medium">วันจ่าย{tag(dates.customPay)}
          <input type="date" name="payDate" defaultValue={dates.payDate} required disabled={!canEdit} className={input} />
        </label>
        <label className="grid min-w-48 flex-1 gap-1 text-xs font-medium">หมายเหตุ
          <input name="note" defaultValue={dates.note ?? ''} maxLength={200} placeholder="เช่น เลื่อนเพราะหยุดปีใหม่" disabled={!canEdit} className={input} />
        </label>
        {canEdit && (
          <>
            <Button type="submit" size="sm">บันทึกวันที่</Button>
            {(dates.customEnd || dates.customPay) && <Button type="submit" size="sm" variant="outline" name="reset" value="1" formNoValidate>ใช้ค่าตั้งต้น</Button>}
          </>
        )}
      </form>
      <p id="start-hint" className="mt-2 text-xs text-muted-foreground">
        วันเริ่ม = วันถัดจากวันสิ้นสุดของรอบก่อน (แก้ที่รอบก่อน) · เลื่อนวันสิ้นสุดรอบนี้ วันเริ่มรอบถัดไปจะเลื่อนตาม · ค่าตั้งต้นตั้งที่หน้า “บริษัท / Odoo”
        {endLocked && ' · รอบอนุมัติแล้ว แก้ได้เฉพาะวันจ่าย'}
      </p>
    </details>
  );
}
