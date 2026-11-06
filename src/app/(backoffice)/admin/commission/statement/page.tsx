import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext } from '@/lib/commission/context';
import { isValidOn, rateLabel } from '@/lib/commission/calc';
import { fetchCategories, fetchPricelists } from '@/lib/commission/odoo';
import { todayBangkok } from '@/lib/commission/period';
import { listPricelists, listRates } from '@/lib/commission/repo';
import { tryClientFor } from '@/lib/commission/service';
import { statementSettings } from '@/lib/commission/statement';
import { PAYMENT_KIND_LABELS, PRICE_GROUP_LABELS, type SummaryLine } from '@/lib/commission/types';
import { saveStatementSettingsAction, seedStatementFromRatesAction } from '../actions';

const PATH = '/admin/commission/statement';
const label = 'block text-xs font-medium';
const input = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal';
const cell = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm';
const BLANK_ROWS = 3;
const pricelistName = (row: SummaryLine) => row.pricelistName ?? `pricelist #${row.pricelistId}`;
type Search = { source?: string; period?: string; saved?: string; error?: string };

/**
 * Layout of the per-rep commission statement ("สรุปค่าคอมมิชชั่น"): its rows, each catching
 * commission by product family (last part of the Odoo category, e.g. PCR in AT-PCR), price group and
 * cash / credit sale, plus the central fund % and the hold on invoices left unpaid too long.
 */
export default async function CommissionStatementSettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  const settings = source ? statementSettings(source) : null;
  const client = source ? tryClientFor(source) : null;
  const [categories, odooPricelists, mapped, rates] = source
    ? await Promise.all([
      client ? fetchCategories(client).catch(() => [] as string[]) : Promise.resolve([] as string[]),
      client ? fetchPricelists(client).catch(() => [] as { id: number; name: string }[]) : Promise.resolve([] as { id: number; name: string }[]),
      listPricelists(source.id), listRates(source.id),
    ])
    : [[], [], [], []];
  const families = [...new Set(categories.map((c) => c.split('-').at(-1)!.toUpperCase()))].sort();
  // Same choices as the rates tab: Odoo's live pricelists (else the saved copy), with the rates set on each today.
  const today = todayBangkok();
  const pricelists = odooPricelists.length > 0 ? odooPricelists : mapped.map((p) => ({ id: p.odooPricelistId, name: p.name }));
  const ratesOf = new Map<number, string[]>();
  for (const r of rates) {
    if (r.odooPricelistId === null || !isValidOn(r, today)) continue;
    const scope = [r.brand, r.family].filter((v) => v !== '*').join('-');
    ratesOf.set(r.odooPricelistId, [...(ratesOf.get(r.odooPricelistId) ?? []), `${scope ? `${scope} ` : ''}${rateLabel(r)}`]);
  }
  const pricelistRates = rates.some((r) => r.odooPricelistId !== null);
  const rows: (SummaryLine | null)[] = settings ? [...settings.summaryLines, ...Array<null>(BLANK_ROWS).fill(null)] : [];

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="ใบสรุปค่าคอม" showPeriod={false}
        description="บรรทัดในใบสรุปค่าคอมรายคน และรายการหักส่วนกลาง / ลูกหนี้ค้างชำระ มีผลเมื่อกดคำนวณรอบที่ยังเป็นร่าง" />
      <Notice saved={params.saved} error={params.error} />
      {!source || !settings ? <NoSource /> : (
        <>
        {pricelistRates && (
          <form action={seedStatementFromRatesAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-sm">
            <input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={ctx.period} />
            <span className="flex-1">สร้างบรรทัดใบสรุปจากอัตราที่ตั้งราย pricelist ในแท็บอัตราค่าคอม (1 บรรทัดต่อ pricelist) · แทนที่บรรทัดเดิมทั้งหมด</span>
            <Button type="submit" size="sm" variant="outline"><Wand2 /> สร้างจากอัตราค่าคอม</Button>
          </form>
        )}
        <form action={saveStatementSettingsAction} className="space-y-4">
          <input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={ctx.period} />
          <datalist id="families">{['*', ...families].map((f) => <option key={f} value={f} />)}</datalist>
          {source.summaryLines.length === 0 && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">ยังไม่ได้บันทึก ตอนนี้ใช้บรรทัดตั้งต้นตามชีตของลูกค้า แก้แล้วกดบันทึก</p>}
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-16">ลำดับ</TableHead>
                  <TableHead>ชื่อบรรทัด</TableHead>
                  <TableHead className="w-32">กลุ่มสินค้า</TableHead>
                  <TableHead className="w-56">กลุ่มราคา / Pricelist</TableHead>
                  <TableHead className="w-32">อัตรา (แท็บอัตรา)</TableHead>
                  <TableHead className="w-32">เงินสด/เครดิต</TableHead>
                  <TableHead className="w-16 text-center">ลบ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={row?.key ?? `new-${i}`}>
                    <TableCell data-label="ลำดับ"><input type="hidden" name={`key_${i}`} value={row?.key ?? ''} /><input name={`order_${i}`} type="number" step={1} defaultValue={i + 1} aria-label="ลำดับ" className={cell} /></TableCell>
                    <TableCell data-label="ชื่อบรรทัด"><input name={`label_${i}`} defaultValue={row?.label ?? ''} maxLength={120} placeholder={row ? '' : 'เพิ่มบรรทัดใหม่'} aria-label="ชื่อบรรทัด" className={cell} /></TableCell>
                    <TableCell data-label="กลุ่มสินค้า"><input name={`family_${i}`} list="families" defaultValue={row?.family ?? '*'} maxLength={40} aria-label="กลุ่มสินค้า" className={cell} /></TableCell>
                    <TableCell data-label="กลุ่มราคา">
                      <select name={`group_${i}`} defaultValue={row?.pricelistId ? `pl:${row.pricelistId}|${pricelistName(row)}` : row?.priceGroup ?? '*'} aria-label="กลุ่มราคา" className={cell}>
                        <option value="*">ทุกกลุ่ม</option>
                        {/* Price groups need the hidden pricelist-group page; keep only a row's saved one. */}
                        {row && !row.pricelistId && row.priceGroup !== '*' && <option value={row.priceGroup}>{PRICE_GROUP_LABELS[row.priceGroup]} (ต้องจัดกลุ่ม pricelist)</option>}
                        <optgroup label="Pricelist จาก Odoo">
                          {/* Keep a saved pricelist selectable even when Odoo no longer lists it. */}
                          {row?.pricelistId && !pricelists.some((p) => p.id === row.pricelistId) && <option value={`pl:${row.pricelistId}|${pricelistName(row)}`}>{pricelistName(row)}</option>}
                          {pricelists.map((p) => <option key={p.id} value={`pl:${p.id}|${p.name}`}>{p.name}</option>)}
                        </optgroup>
                      </select>
                    </TableCell>
                    <TableCell data-label="อัตรา" className="text-xs whitespace-normal text-muted-foreground">
                      {row?.pricelistId ? (ratesOf.get(row.pricelistId)?.join(', ') ?? <span className="text-amber-700">ยังไม่ตั้งอัตรา</span>) : 'ตามแท็บอัตรา'}
                    </TableCell>
                    <TableCell data-label="เงินสด/เครดิต">
                      <select name={`kind_${i}`} defaultValue={row?.paymentKind ?? '*'} aria-label="เงินสด/เครดิต" className={cell}>
                        <option value="*">ทั้งหมด</option>
                        {Object.entries(PAYMENT_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </TableCell>
                    <TableCell data-label="ลบ" className="text-center">{row && <input name={`remove_${i}`} type="checkbox" aria-label={`ลบ ${row.label}`} className="size-4" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <p className="text-xs text-muted-foreground">
            ค่าคอมคิดตามอัตราในแท็บอัตราค่าคอมเสมอ หน้านี้แค่จัดว่าค่าคอมไปอยู่บรรทัดไหนของใบสรุป ·
            ค่าคอมแต่ละบรรทัดบิลเข้าบรรทัดแรกที่ตรงเงื่อนไข (* = ทุกค่า) ที่ไม่ตรงบรรทัดใดจะรวมใน “คอมมิชชั่นอื่นๆ”
            บิลเงินสด = วันครบกำหนดเท่ากับวันที่บิล (Payment term “Immediate Payment” หรือไม่ระบุ) นอกนั้นเป็นเครดิต
          </p>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
            <h2 className="text-sm font-semibold sm:col-span-3">รายการหัก</h2>
            <label className={label}>หัก ส่วนกลาง (% ของยอดรวม)<input name="centralPercent" type="number" min={0} max={100} step="0.01" required defaultValue={settings.centralPercent} className={input} /></label>
            <label className={label}>ลูกหนี้ค้างชำระเกิน (วันหลังครบกำหนด)<input name="debtDays" type="number" min={0} max={3650} step={1} required defaultValue={settings.debtDays} className={input} /></label>
            <label className={label}>หัก % ของยอดค้างก่อน VAT (0 = ไม่หัก)<input name="debtPercent" type="number" min={0} max={100} step="0.01" required defaultValue={settings.debtPercent} className={input} /></label>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              บิลที่ยังค้างเกิน {settings.debtDays} วัน ณ วันสิ้นรอบ จะถูกหักจากพนักงานขายเจ้าของบิลครั้งเดียว และคืนในรอบที่เงินเข้าครบ (บรรทัด “คืนเงินลูกหนี้ค้างชำระ (+{settings.debtDays + 1} วัน)”)
            </p>
          </section>
          <Button type="submit">บันทึก</Button>
        </form>
        </>
      )}
    </div>
  );
}
