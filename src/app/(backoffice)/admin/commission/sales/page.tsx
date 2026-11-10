import { Fragment } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, FilterChip, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref } from '@/lib/admin/list';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { fetchSales } from '@/lib/commission/odoo';
import { periodDates, periodLabel, thaiDay } from '@/lib/commission/period';
import { byRepAndGroup, commissionByInvoice, repGroupOf, totalsByRep, type InvoiceCommissionRow, type RepGroupRow } from '@/lib/commission/report';
import { listLedger, listPricelists } from '@/lib/commission/repo';
import { tryClientFor } from '@/lib/commission/service';
import { PRICE_GROUP_LABELS, type LedgerLine } from '@/lib/commission/types';
import { baht } from '@/lib/shop/catalog';
import { cn } from '@/lib/utils';

const PATH = '/admin/commission/sales';
type Search = { source?: string; period?: string; rep?: string; open?: string; saved?: string; error?: string };

const groupLabel = (g: RepGroupRow['priceGroup']) => (g === 'UNMAPPED' ? 'ยังไม่จัดกลุ่ม' : PRICE_GROUP_LABELS[g]);

/**
 * Sales invoiced in the period (by invoice date, credit notes deducted) per rep × price group ×
 * product family, read live from Odoo, next to what was collected in the same period.
 */
export default async function CommissionSalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.view');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  let sales: LedgerLine[] = [];
  let error: string | undefined;
  const [pricelists, collected] = source ? await Promise.all([listPricelists(source.id), listLedger(source.id, ctx.period)]) : [[], []];
  if (source) {
    const client = tryClientFor(source);
    if (!client) error = 'ถอดรหัส API key ของบริษัทนี้ไม่ได้ บันทึกการเชื่อมต่อใหม่ที่หน้า “บริษัท / Odoo”';
    else {
      try {
        sales = await fetchSales(client, ctx.period, periodDates(ctx.calendar, ctx.period));
      } catch (e) {
        error = `อ่านยอดขายจาก Odoo ไม่ได้: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`;
      }
    }
  }
  const salesRows = byRepAndGroup(sales, pricelists);
  const collectedRows = byRepAndGroup(collected, pricelists);
  const key = (r: RepGroupRow) => `${r.odooUserId ?? 'none'}|${r.priceGroup}|${r.family}`;
  const collectedBy = new Map(collectedRows.map((r) => [key(r), r]));
  const merged = [...salesRows, ...collectedRows.filter((r) => !salesRows.some((s) => key(s) === key(r))).map((r) => ({ ...r, base: 0, gross: 0, qty: 0, special: 0 }))];
  const reps = [...new Set(merged.map((r) => r.repName))].sort();
  const rows = merged.filter((r) => !params.rep || r.repName === params.rep).sort((a, b) => a.repName.localeCompare(b.repName) || a.priceGroup.localeCompare(b.priceGroup) || a.family.localeCompare(b.family));
  const subtotal = totalsByRep(rows);
  const collectedSubtotal = totalsByRep(collectedRows);
  // Drill-down: `open` = a row key ("<rep>|<group>|<family>") or "rep:<rep id or none>" for a rep's subtotal.
  const base = { source: source?.id, period: ctx.period, rep: params.rep };
  const openHref = (open: string) => listHref(PATH, base, { open });
  const repKey = (r: Pick<RepGroupRow, 'odooUserId'>) => `rep:${r.odooUserId ?? 'none'}`;
  const plMap = new Map(pricelists.map((p) => [p.odooPricelistId, p]));
  const inOpen = (l: LedgerLine) => {
    const g = repGroupOf(l, plMap);
    return !!g && (params.open === g.key || params.open === `rep:${l.odooUserId ?? 'none'}`);
  };
  const openRow = params.open ? merged.find((r) => key(r) === params.open || repKey(r) === params.open) : undefined;
  const openTitle = openRow && (params.open?.startsWith('rep:') ? `${openRow.repName} · ทุกกลุ่ม` : `${openRow.repName} · ${groupLabel(openRow.priceGroup)} · ${openRow.family}`);
  const noResults = new Map();
  const openSales = openRow ? commissionByInvoice(sales.filter(inOpen), noResults) : [];
  const openCollected = openRow ? commissionByInvoice(collected.filter(inOpen), noResults) : [];

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="ยอดขายตามกลุ่มราคา ต่อพนักงานขาย"
        description={source ? `${periodLabel(ctx.period, ctx.calendar)} · ยอดขาย = ใบแจ้งหนี้ตามวันที่ออก หักใบลดหนี้ (อ่านจาก Odoo ตอนเปิดหน้า) · ยอดเก็บ = เงินเข้าในรอบเดียวกัน` : undefined}
        actions={source && <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/admin/commission/export?${ctxQuery(ctx, { kind: 'sales' })}`} />}><Download /> Excel</Button>} />
      <Notice saved={params.saved} error={params.error ?? error} />
      {!source ? <NoSource /> : (
        <>
          <div className="flex flex-wrap gap-2">
            <FilterChip href={listHref(PATH, { source: source.id, period: ctx.period })} active={!params.rep}>ทุกคน</FilterChip>
            {reps.map((r) => <FilterChip key={r} href={listHref(PATH, { source: source.id, period: ctx.period }, { rep: r })} active={params.rep === r}>{r}</FilterChip>)}
          </div>
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>พนักงานขาย</TableHead>
                  <TableHead>กลุ่มราคา</TableHead>
                  <TableHead>ยี่ห้อ-กลุ่มสินค้า</TableHead>
                  <TableHead className="text-right">หน่วย</TableHead>
                  <TableHead className="text-right">ยอดขาย ก่อน VAT</TableHead>
                  <TableHead className="text-right">ในนั้นราคาพิเศษ</TableHead>
                  <TableHead className="text-right">ยอดเก็บ ก่อน VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <EmptyRow colSpan={7}>ไม่มียอดขายในรอบนี้</EmptyRow>}
                {rows.map((r, i) => (
                  <Fragment key={key(r)}>
                    <TableRow>
                      <TableCell data-label="พนักงานขาย" className="font-medium">{r.repName}</TableCell>
                      <TableCell data-label="กลุ่มราคา" className={r.priceGroup === 'UNMAPPED' ? 'text-amber-700' : undefined}>{groupLabel(r.priceGroup)}</TableCell>
                      <TableCell data-label="กลุ่มสินค้า">{r.family}</TableCell>
                      <TableCell data-label="หน่วย" className="text-right tabular-nums">{r.qty.toLocaleString('th-TH')}</TableCell>
                      <TableCell data-label="ยอดขาย" className="text-right font-semibold tabular-nums"><Link href={openHref(key(r))} scroll={false} title="ดูใบแจ้งหนี้" className="text-primary hover:underline">{baht(r.base)}</Link></TableCell>
                      <TableCell data-label="ราคาพิเศษ" className="text-right tabular-nums text-muted-foreground">{r.special ? baht(r.special) : '—'}</TableCell>
                      <TableCell data-label="ยอดเก็บ" className="text-right tabular-nums"><Link href={openHref(key(r))} scroll={false} title="ดูใบแจ้งหนี้" className="hover:underline">{baht(collectedBy.get(key(r))?.base ?? 0)}</Link></TableCell>
                    </TableRow>
                    {rows[i + 1]?.repName !== r.repName && (
                      <TableRow className="bg-muted/40">
                        <TableCell colSpan={4} className="text-right text-xs font-semibold">รวม {r.repName}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums"><Link href={openHref(repKey(r))} scroll={false} title="ดูใบแจ้งหนี้" className="text-primary hover:underline">{baht(subtotal.get(r.repName)?.base ?? 0)}</Link></TableCell>
                        <TableCell />
                        <TableCell className="text-right font-bold tabular-nums"><Link href={openHref(repKey(r))} scroll={false} title="ดูใบแจ้งหนี้" className="hover:underline">{baht(collectedSubtotal.get(r.repName)?.base ?? 0)}</Link></TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <p className="text-xs text-muted-foreground">“ยังไม่จัดกลุ่ม” = pricelist ที่ยังไม่ได้จัดเป็นปลีก/ส่ง · ยอดเก็บมาจากข้อมูลที่ดึงล่าสุดในหน้า “ยอดเก็บได้” · กดตัวเลขเพื่อดูว่ามาจากใบแจ้งหนี้ใบไหน</p>
          {openRow && (
            <UrlDrawer title={openTitle} description={periodLabel(ctx.period, ctx.calendar)} closeHref={listHref(PATH, base)} size="xl">
              <InvoiceList title="ยอดขาย (ใบแจ้งหนี้ที่ออกในรอบ หักใบลดหนี้)" rows={openSales} dateLabel="ออก" />
              <InvoiceList title="ยอดเก็บ (เงินเข้าในรอบ)" rows={openCollected} dateLabel="เงินเข้า" />
            </UrlDrawer>
          )}
        </>
      )}
    </div>
  );
}

/** Invoices behind one sales / collections figure, largest first, with a total that matches the cell. */
function InvoiceList({ title, rows, dateLabel }: { title: string; rows: InvoiceCommissionRow[]; dateLabel: string }) {
  const total = rows.reduce((t, r) => ({ base: t.base + r.base, gross: t.gross + r.gross, qty: t.qty + r.qty }), { base: 0, gross: 0, qty: 0 });
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>ใบแจ้งหนี้ / ลูกค้า</TableHead>
              <TableHead>{dateLabel}</TableHead>
              <TableHead>สินค้า</TableHead>
              <TableHead className="text-right">หน่วย</TableHead>
              <TableHead className="text-right">รวม VAT</TableHead>
              <TableHead className="text-right">ก่อน VAT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <EmptyRow colSpan={6}>ไม่มีรายการ</EmptyRow>}
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell data-label="ใบแจ้งหนี้" className="whitespace-normal"><span className="font-medium">{r.invoiceName ?? r.receipts.join(', ')}</span><span className="block text-xs text-muted-foreground">{r.partnerName}</span></TableCell>
                <TableCell data-label={dateLabel} className="text-xs whitespace-normal">{thaiDay(r.cashDate)}{r.receipts.some((n) => n !== r.invoiceName) && <span className="block text-muted-foreground">{r.receipts.join(', ')}</span>}</TableCell>
                <TableCell data-label="สินค้า" className="text-xs whitespace-normal">{r.families.join(', ') || '—'}</TableCell>
                <TableCell data-label="หน่วย" className="text-right text-xs tabular-nums">{r.qty.toLocaleString('th-TH')}</TableCell>
                <TableCell data-label="รวม VAT" className="text-right text-xs tabular-nums">{baht(r.gross)}</TableCell>
                <TableCell data-label="ก่อน VAT" className={cn('text-right font-semibold tabular-nums', r.base < 0 && 'text-destructive')}>{baht(r.base)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <tfoot>
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={3} className="text-right text-xs">รวม {rows.length} ใบ</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{(Math.round(total.qty * 100) / 100).toLocaleString('th-TH')}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{baht(total.gross)}</TableCell>
                <TableCell className="text-right tabular-nums">{baht(total.base)}</TableCell>
              </TableRow>
            </tfoot>
          )}
        </Table>
      </TableCard>
    </section>
  );
}
