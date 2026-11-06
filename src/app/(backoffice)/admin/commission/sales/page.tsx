import { Fragment } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, FilterChip, TableCard } from '@/components/admin/list-kit';
import { listHref } from '@/lib/admin/list';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { fetchSales } from '@/lib/commission/odoo';
import { periodDates, periodLabel } from '@/lib/commission/period';
import { byRepAndGroup, totalsByRep, type RepGroupRow } from '@/lib/commission/report';
import { listLedger, listPricelists } from '@/lib/commission/repo';
import { tryClientFor } from '@/lib/commission/service';
import { PRICE_GROUP_LABELS, type LedgerLine } from '@/lib/commission/types';
import { baht } from '@/lib/shop/catalog';

const PATH = '/admin/commission/sales';
type Search = { source?: string; period?: string; rep?: string; saved?: string; error?: string };

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
                      <TableCell data-label="ยอดขาย" className="text-right font-semibold tabular-nums">{baht(r.base)}</TableCell>
                      <TableCell data-label="ราคาพิเศษ" className="text-right tabular-nums text-muted-foreground">{r.special ? baht(r.special) : '—'}</TableCell>
                      <TableCell data-label="ยอดเก็บ" className="text-right tabular-nums">{baht(collectedBy.get(key(r))?.base ?? 0)}</TableCell>
                    </TableRow>
                    {rows[i + 1]?.repName !== r.repName && (
                      <TableRow className="bg-muted/40">
                        <TableCell colSpan={4} className="text-right text-xs font-semibold">รวม {r.repName}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{baht(subtotal.get(r.repName)?.base ?? 0)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-bold tabular-nums">{baht(collectedSubtotal.get(r.repName)?.base ?? 0)}</TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <p className="text-xs text-muted-foreground">“ยังไม่จัดกลุ่ม” = pricelist ที่ยังไม่ได้จัดเป็นปลีก/ส่ง · ยอดเก็บมาจากข้อมูลที่ดึงล่าสุดในหน้า “ยอดเก็บได้”</p>
        </>
      )}
    </div>
  );
}
