import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext } from '@/lib/commission/context';
import { listPricelists } from '@/lib/commission/repo';
import { PRICE_GROUP_LABELS, type PriceGroup } from '@/lib/commission/types';
import { savePricelistsAction, syncPricelistsAction } from '../actions';

const PATH = '/admin/commission/pricelists';
const input = 'h-9 rounded-lg border border-border bg-background px-2 text-sm';
type Search = { source?: string; period?: string; saved?: string; error?: string };

/**
 * Odoo pricelists grouped as retail / wholesale / other (rates are set per group), and flagged as
 * "special price / promotion" where the rep gets only part (default 50%) of the normal commission.
 */
export default async function CommissionPricelistsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const rows = ctx.source ? await listPricelists(ctx.source.id) : [];

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="กลุ่มราคา (Pricelist)" showPeriod={false}
        description="pricelist ของบรรทัดขายมาจากใบสั่งขาย (บิลที่ไม่มีใบสั่งขายใช้ pricelist ประจำลูกค้า) จัดกลุ่มเพื่อเลือกอัตราค่าคอม"
        actions={ctx.source && (
          <form action={syncPricelistsAction}>
            <input type="hidden" name="source" value={ctx.source.id} />
            <input type="hidden" name="period" value={ctx.period} />
            <Button type="submit" size="sm" variant="outline"><RefreshCw /> ดึงจาก Odoo</Button>
          </form>
        )} />
      <Notice saved={params.saved} error={params.error} />
      {!ctx.source ? <NoSource /> : (
        <form action={savePricelistsAction} className="space-y-3">
          <input type="hidden" name="source" value={ctx.source.id} />
          <input type="hidden" name="period" value={ctx.period} />
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Pricelist (Odoo)</TableHead>
                  <TableHead>กลุ่มราคา</TableHead>
                  <TableHead>ราคาพิเศษ / จัดโปร</TableHead>
                  <TableHead>ได้ % ของค่าคอมปกติ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <EmptyRow colSpan={4}>ยังไม่มี pricelist กด “ดึงจาก Odoo”</EmptyRow>}
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell data-label="Pricelist" className="font-medium whitespace-normal">{p.name}<span className="block text-xs font-normal text-muted-foreground">#{p.odooPricelistId}</span></TableCell>
                    <TableCell data-label="กลุ่มราคา">
                      <select name={`group_${p.id}`} defaultValue={p.priceGroup} aria-label={`กลุ่มราคาของ ${p.name}`} className={input}>
                        {(Object.keys(PRICE_GROUP_LABELS) as PriceGroup[]).map((g) => <option key={g} value={g}>{PRICE_GROUP_LABELS[g]}</option>)}
                      </select>
                    </TableCell>
                    <TableCell data-label="ราคาพิเศษ"><label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name={`special_${p.id}`} defaultChecked={p.isSpecial} /> ราคาพิเศษ</label></TableCell>
                    <TableCell data-label="% ที่ได้">
                      <span className="flex items-center gap-1"><input name={`pct_${p.id}`} type="number" min={0} max={100} step="0.01" defaultValue={p.specialPercent} aria-label={`% ค่าคอมของ ${p.name}`} className={`${input} w-24 text-right`} /> %</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          {rows.length > 0 && <Button type="submit" size="sm">บันทึก</Button>}
          <p className="text-xs text-muted-foreground">% ที่ได้ใช้เฉพาะ pricelist ที่ติ๊ก “ราคาพิเศษ” เช่น 50 = ได้ครึ่งหนึ่งของค่าคอมตามอัตรา · pricelist ใหม่ที่ดึงมาเริ่มเป็น “อื่นๆ”</p>
        </form>
      )}
    </div>
  );
}
