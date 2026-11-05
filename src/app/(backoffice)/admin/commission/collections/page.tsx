import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, FilterChip, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { requirePermission } from '@/lib/auth/session';
import { pickStepPercent } from '@/lib/commission/calc';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { payDate, periodLabel, thaiDay } from '@/lib/commission/period';
import { groupByInvoice } from '@/lib/commission/report';
import { getRun, listLedger, listSteps } from '@/lib/commission/repo';
import { baht } from '@/lib/shop/catalog';
import { cn } from '@/lib/utils';
import { syncPeriodAction } from '../actions';

const PATH = '/admin/commission/collections';
type Search = { source?: string; period?: string; q?: string; rep?: string; issues?: string; page?: string; saved?: string; error?: string };
const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/**
 * Cash that reached the bank in the period, per receipt × invoice: invoice number, due date and days
 * overdue (which Odoo's receipt does not show), rep, pricelist, amounts before/after VAT and anything
 * to check. Data is the period's ledger, pulled from Odoo with "ดึงข้อมูลจาก Odoo".
 */
export default async function CommissionCollectionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission('commission.view');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  const [ledger, steps, run] = source ? await Promise.all([listLedger(source.id, ctx.period), listSteps(source.id), getRun(source.id, ctx.period)]) : [[], [], null];
  const all = groupByInvoice(ledger);
  const reps = [...new Map(all.filter((r) => r.odooUserId !== null).map((r) => [String(r.odooUserId), r.repName ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const q = searchText(params.q);
  const rows = all.filter((r) => (!params.rep || String(r.odooUserId ?? 'none') === params.rep) && (params.issues !== '1' || r.issues.length > 0)
    && matchesSearch(q, r.receiptName, r.partnerName, r.invoiceName, r.repName));
  const page = paginate(rows, params.page);
  const sum = (key: 'base' | 'gross') => rows.reduce((s, r) => s + r[key], 0);
  const withIssues = all.filter((r) => r.issues.length).length;
  const filter = { source: source?.id, period: ctx.period, q: params.q, rep: params.rep, issues: params.issues };
  const href = (changes: Record<string, string | undefined>) => listHref(PATH, filter, { page: undefined, ...changes });
  const canSync = can(user.role as Role, 'commission.run');

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="ยอดเก็บได้ (เงินเข้าบัญชี)"
        description={source ? `${periodLabel(ctx.period, source.cutoffDay)} · จ่ายค่าคอม ${thaiDay(payDate(ctx.period))} · นับจากวันเงินเข้า/เช็คขึ้นเงิน ไม่ใช่วันลงรับชำระ` : undefined}
        actions={source && (
          <>
            {canSync && (
              <form action={syncPeriodAction}>
                <input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={ctx.period} /><input type="hidden" name="returnTo" value="collections" />
                <Button type="submit" size="sm" disabled={run?.status === 'APPROVED' || run?.status === 'PAID'}><RefreshCw /> ดึงข้อมูลจาก Odoo</Button>
              </form>
            )}
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/admin/commission/export?${ctxQuery(ctx, { kind: 'collections' })}`} />}><Download /> Excel</Button>
          </>
        )} />
      <Notice saved={params.saved} error={params.error} />
      {!source ? <NoSource /> : (
        <>
          <p className="text-xs text-muted-foreground">{run?.syncedAt ? `ดึงข้อมูลล่าสุด ${fmt.format(run.syncedAt)}` : 'ยังไม่ได้ดึงข้อมูลรอบนี้'}{run && ` · สถานะรอบ: ${run.status === 'DRAFT' ? 'ร่าง' : run.status === 'PENDING_APPROVAL' ? 'รออนุมัติ' : run.status === 'APPROVED' ? 'อนุมัติแล้ว (ล็อก)' : 'จ่ายแล้ว'}`}</p>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="เงินเข้า (รวม VAT)" value={baht(sum('gross'))} sub={`${rows.length} รายการ ใบเสร็จ × ใบแจ้งหนี้`} />
            <Tile label="ฐานค่าคอม (ก่อน VAT)" value={baht(sum('base'))} sub="แบ่งตามสัดส่วนบรรทัดสินค้า" />
            <Tile label="ใบแจ้งหนี้" value={String(new Set(rows.map((r) => r.invoiceName).filter(Boolean)).size)} sub={`${new Set(rows.map((r) => r.receiptName)).size} ใบเสร็จ/รายการเงินเข้า`} />
            <Tile label="ต้องตรวจสอบ" value={String(withIssues)} sub="ไม่มีพนักงาน / ไม่มี pricelist / ไม่ใช่ใบแจ้งหนี้" warn={withIssues > 0} />
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip href={href({ rep: undefined })} active={!params.rep}>ทุกคน</FilterChip>
            {reps.map(([id, name]) => <FilterChip key={id} href={href({ rep: id })} active={params.rep === id}>{name}</FilterChip>)}
            <FilterChip href={href({ rep: 'none' })} active={params.rep === 'none'}>ไม่มีพนักงาน</FilterChip>
            <FilterChip href={href({ issues: params.issues === '1' ? undefined : '1' })} active={params.issues === '1'}>เฉพาะที่ต้องตรวจ {withIssues}</FilterChip>
            <div className="w-full sm:ml-auto sm:w-auto">
              <ListSearch action={PATH} q={params.q} placeholder="ใบเสร็จ ลูกค้า ใบแจ้งหนี้" keep={{ source: source.id, period: ctx.period, rep: params.rep, issues: params.issues }} />
            </div>
          </div>

          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>วันเงินเข้า</TableHead>
                  <TableHead>ใบเสร็จ / ลูกค้า</TableHead>
                  <TableHead>ใบแจ้งหนี้</TableHead>
                  <TableHead>ครบกำหนด</TableHead>
                  <TableHead className="text-right">เกินดิว</TableHead>
                  <TableHead>พนักงานขาย</TableHead>
                  <TableHead>Pricelist / สินค้า</TableHead>
                  <TableHead className="text-right">รวม VAT</TableHead>
                  <TableHead className="text-right">ก่อน VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.length === 0 && <EmptyRow colSpan={9}>{ledger.length ? 'ไม่พบตามตัวกรอง' : 'ยังไม่มีข้อมูล กด “ดึงข้อมูลจาก Odoo”'}</EmptyRow>}
                {page.items.map((r) => {
                  const step = r.invoiceName ? pickStepPercent(steps, r.overdueDays ?? 0, r.cashDate) : null;
                  return (
                    <TableRow key={r.key} className={cn(r.kind === 'RETRO' && 'bg-amber-500/5')}>
                      <TableCell data-label="วันเงินเข้า" className="text-xs">{thaiDay(r.cashDate)}{r.kind === 'RETRO' && <Badge variant="outline" className="ml-1 border-transparent bg-amber-500/15 text-amber-800">ปรับย้อนหลัง</Badge>}</TableCell>
                      <TableCell data-label="ใบเสร็จ" className="whitespace-normal"><span className="font-medium">{r.receiptName}</span><span className="block text-xs text-muted-foreground">{r.partnerName}</span></TableCell>
                      <TableCell data-label="ใบแจ้งหนี้" className="text-xs">{r.invoiceName ?? '—'}<span className="block text-muted-foreground">{r.invoiceDate ? thaiDay(r.invoiceDate) : ''}</span></TableCell>
                      <TableCell data-label="ครบกำหนด" className="text-xs">{thaiDay(r.dueDate)}</TableCell>
                      <TableCell data-label="เกินดิว" className="text-right text-xs tabular-nums">
                        {r.invoiceName ? <>{r.overdueDays ?? 0} วัน<span className={cn('block', step === 0 ? 'text-destructive' : 'text-muted-foreground')}>ขั้น {step}%</span></> : '—'}
                      </TableCell>
                      <TableCell data-label="พนักงานขาย" className="text-xs">{r.repName ?? <span className="text-destructive">ไม่มี</span>}</TableCell>
                      <TableCell data-label="Pricelist" className="text-xs whitespace-normal">{r.pricelists.join(', ') || '—'}<span className="block text-muted-foreground">{r.families.join(', ')}</span></TableCell>
                      <TableCell data-label="รวม VAT" className="text-right tabular-nums">{baht(r.gross)}</TableCell>
                      <TableCell data-label="ก่อน VAT" className="text-right font-semibold tabular-nums">
                        {baht(r.base)}
                        {r.issues.length > 0 && <span className="mt-1 flex items-start justify-end gap-1 text-left text-[11px] font-normal whitespace-normal text-amber-700"><AlertTriangle className="size-3 shrink-0" />{r.issues.join(' · ')}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
          <ListPagination page={page} href={(n) => listHref(PATH, filter, { page: n > 1 ? n : undefined })} />
        </>
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
