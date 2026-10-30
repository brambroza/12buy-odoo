import Link from 'next/link';
import { BarChart3, CalendarRange } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, FilterChip, TableCard } from '@/components/admin/list-kit';
import { ExportMenu } from '@/components/admin/export-menu';
import * as admin from '@/lib/admin/store';
import { listHref } from '@/lib/admin/list';
import { RANGE_LABELS, byDealer, byFamily, byLookup, byMonth, byProduct, dailySeries, ordersInRange, rangeTotals, resolveRange, type GroupRow, type RangeKey } from '@/lib/admin/reports';
import { requirePermission } from '@/lib/auth/session';
import { listDealers } from '@/lib/dealers/repo';
import { baht, getCatalog } from '@/lib/shop/catalog';
import { dealerIdFromSession } from '@/lib/shop/odoo-sync';
import { listAllOrders } from '@/lib/shop/store';
import { DEALER_TYPE_LABELS } from '@/lib/shop/types';
import { cn } from '@/lib/utils';

const PATH = '/admin/reports';
const GROUPS = { dealer: 'ตามดีลเลอร์', product: 'ตามสินค้า', family: 'ตามประเภทสินค้า', zone: 'ตามโซนราคา', province: 'ตามจังหวัด', month: 'ตามเดือน' } as const;
type GroupKey = keyof typeof GROUPS;
const QUICK: RangeKey[] = ['today', '7d', '30d', 'month', 'lastMonth', 'year'];
const dayLabel = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });

type Search = { range?: string; from?: string; to?: string; group?: string };

/** Sales reports: pick a period, see totals, a daily chart and a breakdown by dealer / product / family / zone / province / month. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [, params] = await Promise.all([requirePermission('order.export'), searchParams]);
  const { key, range } = resolveRange(params);
  const group: GroupKey = params.group && params.group in GROUPS ? (params.group as GroupKey) : 'dealer';
  const [all, dealers, zones, catalog] = await Promise.all([listAllOrders(), listDealers().catch(() => []), admin.listZones().catch(() => []), getCatalog().catch(() => null)]);
  const orders = ordersInRange(all, range);
  const totals = rangeTotals(orders);
  const daily = dailySeries(orders, range);
  const maxDay = Math.max(1, ...daily.map((d) => d.sales));

  const dealerById = new Map(dealers.map((d) => [d.id, d]));
  const zoneOfProvince = new Map<string, string>();
  for (const z of zones) for (const p of z.provinces) zoneOfProvince.set(p, z.name);
  const defaultZone = zones.find((z) => z.isDefault)?.name ?? 'ค่าเริ่มต้น';
  const provinceOf = (sessionId: string) => { const id = dealerIdFromSession(sessionId); return id ? dealerById.get(id)?.province?.replace(/^จังหวัด/, '') ?? null : null; };
  const familyOf = (productId: number) => catalog?.products.find((p) => p.id === productId)?.dealerType;

  const rows: GroupRow[] = group === 'dealer' ? byDealer(orders)
    : group === 'product' ? byProduct(orders)
    : group === 'family' ? byFamily(orders, familyOf, DEALER_TYPE_LABELS)
    : group === 'zone' ? byLookup(orders, (o) => { const p = provinceOf(o.sessionId); return p ? zoneOfProvince.get(p) ?? zoneOfProvince.get(`จังหวัด${p}`) ?? defaultZone : null; })
    : group === 'province' ? byLookup(orders, (o) => provinceOf(o.sessionId))
    : byMonth(orders);
  const href = (changes: Record<string, string | undefined>) => listHref(PATH, { range: params.range, from: params.from, to: params.to, group }, changes);
  const exportQuery = { range: key === 'custom' ? undefined : key, from: key === 'custom' ? range.from : undefined, to: key === 'custom' ? range.to : undefined };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 className="size-6" /> รายงานยอดขาย</h1>
          <p className="text-sm text-muted-foreground">ออเดอร์จากเว็บ (ไม่รวมที่ยกเลิก) ช่วง {dayLabel.format(new Date(range.from))} – {dayLabel.format(new Date(range.to))} · ตัวเลขบัญชีทางการดูใน Odoo</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu kind="orders" query={exportQuery} label="ออเดอร์" />
          <ExportMenu kind="order-lines" query={exportQuery} label="รายสินค้า" />
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
        {QUICK.map((k) => <FilterChip key={k} href={href({ range: k, from: undefined, to: undefined })} active={key === k}>{RANGE_LABELS[k]}</FilterChip>)}
        <form action={PATH} className="ml-auto flex flex-wrap items-center gap-1 text-xs">
          <input type="hidden" name="group" value={group} />
          <Input name="from" type="date" defaultValue={range.from} aria-label="จากวันที่" className="h-8 w-36" />
          <span>–</span>
          <Input name="to" type="date" defaultValue={range.to} aria-label="ถึงวันที่" className="h-8 w-36" />
          <Button type="submit" size="sm" variant={key === 'custom' ? 'default' : 'outline'} className="h-8">ใช้ช่วงนี้</Button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="สรุปช่วงเวลา">
        <Tile label="ยอดขาย" value={baht(totals.sales)} sub={`${totals.orders} ออเดอร์ · เฉลี่ย ${baht(totals.avgOrder)}`} />
        <Tile label="รับชำระแล้ว" value={baht(totals.paid)} sub={`ค้างรับ ${baht(totals.outstanding)}`} tone={totals.outstanding > 0 ? 'warn' : 'ok'} />
        <Tile label="เงินสด / เครดิต" value={`${baht(totals.cash)} / ${baht(totals.credit)}`} sub={totals.sales ? `เครดิต ${Math.round((totals.credit / totals.sales) * 100)}% ของยอด` : '—'} />
        <Tile label="ร้านที่สั่ง" value={String(totals.dealers)} sub={`${totals.units.toLocaleString('th-TH')} หน่วย`} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="daily-heading">
        <h2 id="daily-heading" className="mb-3 text-sm font-semibold">ยอดขายรายวัน</h2>
        {daily.length > 120 ? <p className="text-sm text-muted-foreground">ช่วงยาวกว่า 120 วัน แสดงกราฟรายวันไม่ได้ ใช้ “ตามเดือน” ด้านล่างแทน</p> : (
          <div className="flex h-40 items-end gap-px overflow-hidden" role="img" aria-label={`ยอดขายรายวัน ${daily.length} วัน`}>
            {daily.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${dayLabel.format(new Date(d.day))} · ${d.orders} ออเดอร์ · ${baht(d.sales)}`}>
                <div className={cn('w-full rounded-t-sm bg-primary/70 transition group-hover:bg-primary', d.sales === 0 && 'bg-border')} style={{ height: `${Math.max(d.sales === 0 ? 2 : 6, (d.sales / maxDay) * 100)}%` }} />
              </div>
            ))}
          </div>
        )}
        <table className="sr-only"><caption>ยอดขายรายวัน</caption><thead><tr><th>วัน</th><th>ออเดอร์</th><th>ยอด</th></tr></thead><tbody>{daily.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.orders}</td><td>{d.sales}</td></tr>)}</tbody></table>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(GROUPS) as GroupKey[]).map((g) => <FilterChip key={g} href={href({ group: g })} active={group === g}>{GROUPS[g]}</FilterChip>)}
      </div>
      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{GROUPS[group]}</TableHead>
              <TableHead className="text-right">ออเดอร์</TableHead>
              <TableHead className="text-right">หน่วย</TableHead>
              <TableHead className="text-right">ยอดขาย</TableHead>
              <TableHead className="text-right">ชำระแล้ว</TableHead>
              <TableHead className="w-40">สัดส่วน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <EmptyRow colSpan={6}>ไม่มีออเดอร์ในช่วงนี้</EmptyRow>}
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell data-label={GROUPS[group]} className="whitespace-normal">
                  {group === 'dealer' ? <Link href={`/admin/orders?q=${encodeURIComponent(r.label)}`} className="hover:underline">{r.label}</Link> : r.label}
                </TableCell>
                <TableCell data-label="ออเดอร์" className="text-right tabular-nums">{r.orders}</TableCell>
                <TableCell data-label="หน่วย" className="text-right tabular-nums">{r.units.toLocaleString('th-TH')}</TableCell>
                <TableCell data-label="ยอดขาย" className="text-right font-semibold tabular-nums">{baht(r.sales)}</TableCell>
                <TableCell data-label="ชำระแล้ว" className="text-right tabular-nums text-muted-foreground">{baht(r.paid)}</TableCell>
                <TableCell data-label="สัดส่วน">
                  <span className="flex items-center gap-2"><span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${r.share}%` }} /></span><Badge variant="outline" className="tabular-nums">{r.share}%</Badge></span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', tone === 'warn' && 'text-amber-700', tone === 'ok' && 'text-emerald-700')}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
