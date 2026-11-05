import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, Calculator, CheckCircle2, Download, FileText, RefreshCw, Send, Trash2, Undo2, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { requirePermission } from '@/lib/auth/session';
import { findUserById } from '@/lib/auth/users';
import { blockingIssues } from '@/lib/commission/calc';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { isPeriod, payDate, periodLabel, thaiDay } from '@/lib/commission/period';
import { getRun, listAdjustments, listLedger, listReps } from '@/lib/commission/repo';
import { OWNER_FROM_LABELS, PAYMENT_KIND_LABELS, RUN_STATUS_LABELS, RUN_STATUS_TONE } from '@/lib/commission/types';
import { baht } from '@/lib/shop/catalog';
import { cn } from '@/lib/utils';
import { addAdjustmentAction, calculateAction, deleteAdjustmentAction, runStepAction, syncPeriodAction } from '../../actions';

type Search = { source?: string; rep?: string; saved?: string; error?: string };
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
  const drillLines = drillRep !== null ? ledger.filter((l) => l.odooUserId === drillRep) : [];
  const close = `${path}?${ctxQuery(ctx)}`;
  const step = (name: string, label: string, icon: ReactNode, variant: 'default' | 'outline' = 'default') => (
    <form action={runStepAction}>{hidden}<input type="hidden" name="step" value={name} />
      <Button type="submit" size="sm" variant={variant}>{icon} {label}</Button>
    </form>
  );

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={path} title={`รอบค่าคอม ${periodLabel(period, source.cutoffDay)}`}
        description={<>จ่าย {thaiDay(payDate(period))} · <Badge variant="outline" className={`border-transparent ${RUN_STATUS_TONE[status]}`}>{RUN_STATUS_LABELS[status]}</Badge></>}
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

      {results && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Tile label="ค่าคอมที่ต้องจ่าย" value={baht(results.totalPayable)} sub={`${results.reps.filter((r) => r.payable > 0).length} คน`} />
            <Tile label="ฐานค่าคอม (ก่อน VAT)" value={baht(results.reps.reduce((s, r) => s + r.base, 0))} sub={`ไม่มีเจ้าของ ${baht(results.unassignedBase)}`} />
            <Tile label="รายการต้องตรวจ" value={String(results.issues.length)} sub={blocking.length ? `${blocking.length} รายการทำให้ส่งอนุมัติไม่ได้` : 'ไม่มีรายการที่ขวางการส่งอนุมัติ'} warn={blocking.length > 0} />
          </section>

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
                  <TableHead className="text-right">เป้า</TableHead>
                  <TableHead className="text-right">ค่าคอม</TableHead>
                  <TableHead className="text-right">หักส่วนกลาง / ลูกหนี้</TableHead>
                  <TableHead className="text-right">ปรับ / ยกมา</TableHead>
                  <TableHead className="text-right">จ่าย</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.reps.length === 0 && <EmptyRow colSpan={8}>ไม่มีพนักงานที่มียอดในรอบนี้</EmptyRow>}
                {results.reps.map((r) => (
                  <TableRow key={r.odooUserId}>
                    <TableCell data-label="พนักงานขาย"><Link href={`${path}?${ctxQuery(ctx, { rep: String(r.odooUserId) })}`} scroll={false} className="font-medium text-primary hover:underline">{r.repName}</Link><span className="block text-xs text-muted-foreground">{r.lines} บรรทัด</span></TableCell>
                    <TableCell data-label="ยอดเก็บ" className="text-right tabular-nums">{baht(r.base)}</TableCell>
                    <TableCell data-label="เป้า" className="text-right text-xs tabular-nums">
                      {r.target === null ? <span className="text-destructive">ยังไม่ตั้ง</span> : r.target === 0 ? 'ไม่ใช้เป้า' : <>{baht(r.target)}<span className={cn('block', r.targetMet ? 'text-emerald-700' : 'text-destructive')}>{r.targetMet ? 'ถึงเป้า' : 'ไม่ถึงเป้า'}</span></>}
                    </TableCell>
                    <TableCell data-label="ค่าคอม" className="text-right tabular-nums">{baht(r.commission)}{r.debtRelease ? <span className="block text-xs text-emerald-700">คืนลูกหนี้ +{baht(r.debtRelease)}</span> : null}</TableCell>
                    <TableCell data-label="หัก" className="text-right text-xs tabular-nums text-destructive">{r.central ? baht(-r.central) : '—'}{r.debtHold ? <span className="block">ลูกหนี้ {baht(-r.debtHold)}</span> : null}</TableCell>
                    <TableCell data-label="ปรับ/ยกมา" className="text-right text-xs tabular-nums">{r.adjustments ? baht(r.adjustments) : '—'}{r.carryIn ? <span className="block text-destructive">ยกมา {baht(r.carryIn)}</span> : null}</TableCell>
                    <TableCell data-label="จ่าย" className="text-right font-semibold tabular-nums">{baht(r.payable)}{r.carryOut < 0 && <span className="block text-xs font-normal text-destructive">ยกไปหัก {baht(r.carryOut)}</span>}</TableCell>
                    <TableCell>
                      <Link href={`${path}/statement?${ctxQuery(ctx, { rep: String(r.odooUserId) })}`} title="ใบสรุปค่าคอม" aria-label={`ใบสรุปค่าคอมของ ${r.repName}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><FileText className="size-4" /></Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
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
        <UrlDrawer title={`${repName.get(drillRep) ?? results?.reps.find((r) => r.odooUserId === drillRep)?.repName ?? `#${drillRep}`} · รายละเอียดรอบ ${period}`} closeHref={close} size="xl">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillLines.length === 0 && <EmptyRow colSpan={7}>ไม่มีรายการ</EmptyRow>}
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
        </UrlDrawer>
      )}
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', warn && 'text-amber-700')}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
