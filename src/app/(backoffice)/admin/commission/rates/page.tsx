import Link from 'next/link';
import { CalendarX2, Trash2, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { requirePermission } from '@/lib/auth/session';
import { isValidOn, rateLabel } from '@/lib/commission/calc';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { splitCategory } from '@/lib/commission/ledger';
import { fetchCategories, fetchPricelists, searchProducts } from '@/lib/commission/odoo';
import { periodDates, thaiDay, todayBangkok } from '@/lib/commission/period';
import { listPricelists, listRates } from '@/lib/commission/repo';
import { tryClientFor } from '@/lib/commission/service';
import { PRICE_GROUP_LABELS, type PriceGroup } from '@/lib/commission/types';
import { createRateAction, endOrDeleteRateAction, seedDefaultsAction } from '../actions';

const PATH = '/admin/commission/rates';
const label = 'block text-xs font-medium';
const input = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal';
type Search = { source?: string; period?: string; pq?: string; pid?: string; pname?: string; all?: string; saved?: string; error?: string };

/**
 * Commission rates per brand × product family × price group (or per product), as % of the amount
 * before VAT or baht per unit. Rates are effective-dated: to change one, end it and add a new one.
 */
export default async function CommissionRatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const today = todayBangkok();
  const source = ctx.source;
  // New rates start on the first day of the selected period, so they cover cash already in it.
  const periodStart = source ? periodDates(ctx.calendar, ctx.period).start : today;
  const rates = source ? await listRates(source.id) : [];
  const client = source ? tryClientFor(source) : null;
  const [categories, products, odooPricelists, mapped] = client && source
    ? await Promise.all([
      fetchCategories(client).catch(() => [] as string[]),
      params.pq?.trim() ? searchProducts(client, params.pq.trim().slice(0, 60)).catch(() => []) : Promise.resolve([]),
      fetchPricelists(client).catch(() => [] as { id: number; name: string }[]),
      listPricelists(source.id),
    ])
    : [[], [], [], source ? await listPricelists(source.id) : []];
  // Odoo's live list, else the copy kept on the pricelist page; each shows its group when mapped.
  const groupOf = new Map(mapped.map((p) => [p.odooPricelistId, p.priceGroup]));
  const pricelists = odooPricelists.length > 0 ? odooPricelists : mapped.map((p) => ({ id: p.odooPricelistId, name: p.name }));
  const brands = [...new Set(categories.map((c) => splitCategory(c).brand).filter(Boolean))].sort();
  const families = [...new Set(categories.map((c) => splitCategory(c).family).filter(Boolean))].sort();
  // One pick per Odoo product category; the rate stores it as brand + family ("AT-PCR" → AT, PCR).
  const categoryOptions = categories.map((c) => {
    const { brand, family } = splitCategory(c);
    return { value: `${brand || '*'}|${family || '*'}`, label: c.toUpperCase() };
  }).filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i);
  const showAll = params.all === '1';
  const visible = rates.filter((r) => showAll || !r.validTo || r.validTo >= today);
  const pid = Number(params.pid);
  const hidden = source && (<><input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={ctx.period} /></>);

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="อัตราค่าคอม" showPeriod={false}
        description="ค่าคอมพื้นฐาน = ยอดก่อน VAT × % หรือ จำนวนหน่วย × บาท แล้วคูณ % ราคาพิเศษ และ % ขั้นบันไดเกินดิว · ระบบเลือกอัตราที่เจาะจงที่สุด (รายสินค้า > ราย pricelist > กลุ่มราคา)" />
      <Notice saved={params.saved} error={params.error} />
      {!source ? <NoSource /> : (
        <>
          {rates.length === 0 && (
            <form action={seedDefaultsAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-sm">
              {hidden}
              <span className="w-full font-medium">เริ่มจากเงื่อนไขที่ลูกค้าแจ้ง: PCR ปลีก 0.9% ส่ง 0.4% · TBR ปลีก 0.6% ส่ง 0.3% · เกินดิว 0-10 วัน 110%, 11-15 วัน 100%, 16-20 วัน 90%</span>
              <label className={label}>ยี่ห้อ<Input name="brand" defaultValue="AT" className="mt-1 w-36" list="brand-list" /></label>
              <label className={label}>เริ่มใช้<Input name="validFrom" type="date" defaultValue={periodStart} className="mt-1 w-40" /></label>
              <Button type="submit" size="sm"><Wand2 /> สร้างค่าเริ่มต้น</Button>
            </form>
          )}

          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>ใช้กับ</TableHead>
                  <TableHead>กลุ่มราคา</TableHead>
                  <TableHead className="text-right">อัตรา</TableHead>
                  <TableHead>มีผล</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 && <EmptyRow colSpan={6}>ยังไม่มีอัตรา</EmptyRow>}
                {visible.map((r) => (
                  <TableRow key={r.id} className={isValidOn(r, today) ? undefined : 'opacity-60'}>
                    <TableCell data-label="ใช้กับ" className="whitespace-normal">
                      {r.odooProductId ? <><Badge variant="outline">รายสินค้า</Badge> {r.productName ?? `#${r.odooProductId}`}</> : <span className="font-medium">{r.brand === '*' && r.family === '*' ? 'ทุกหมวดสินค้า' : `${r.brand === '*' ? 'ทุกยี่ห้อ' : r.brand}${r.family === '*' ? (r.brand === '*' ? '' : ' (ทุกกลุ่ม)') : `-${r.family}`}`}</span>}
                    </TableCell>
                    <TableCell data-label="กลุ่มราคา" className="whitespace-normal">
                      {r.odooPricelistId ? <><Badge variant="outline">Pricelist</Badge> {r.pricelistName ?? `#${r.odooPricelistId}`}</> : r.priceGroup === '*' ? 'ทุกกลุ่ม' : PRICE_GROUP_LABELS[r.priceGroup]}
                    </TableCell>
                    <TableCell data-label="อัตรา" className="text-right font-semibold tabular-nums">{rateLabel(r)}</TableCell>
                    <TableCell data-label="มีผล" className="text-xs">{thaiDay(r.validFrom)} – {r.validTo ? thaiDay(r.validTo) : 'ไม่กำหนด'}</TableCell>
                    <TableCell data-label="หมายเหตุ" className="text-xs whitespace-normal text-muted-foreground">{r.note}</TableCell>
                    <TableCell>
                      <span className="flex items-center justify-end gap-1">
                        {!r.validTo && (
                          <form action={endOrDeleteRateAction} className="flex items-center gap-1">
                            {hidden}<input type="hidden" name="id" value={r.id} />
                            <input name="validTo" type="date" defaultValue={today} aria-label="สิ้นสุดวันที่" className="h-8 w-36 rounded-lg border border-border bg-background px-1 text-xs" />
                            <IconSubmit label="สิ้นสุดอัตรานี้ในวันที่เลือก"><CalendarX2 /></IconSubmit>
                          </form>
                        )}
                        <form action={endOrDeleteRateAction}>
                          {hidden}<input type="hidden" name="id" value={r.id} /><input type="hidden" name="delete" value="1" />
                          <IconSubmit label="ลบอัตรา" tone="danger" confirm="ลบอัตรานี้? รอบที่อนุมัติแล้วไม่เปลี่ยน แต่รอบที่ยังไม่อนุมัติจะคำนวณใหม่โดยไม่มีอัตรานี้"><Trash2 /></IconSubmit>
                        </form>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <Link href={`${PATH}?${ctxQuery(ctx, { all: showAll ? undefined : '1' })}`} className="text-xs text-primary underline">{showAll ? 'ซ่อนอัตราที่สิ้นสุดแล้ว' : 'แสดงอัตราที่สิ้นสุดแล้วด้วย'}</Link>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">เพิ่มอัตรา</h2>
            <form action={PATH} className="mb-3 flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="source" value={source.id} /><input type="hidden" name="period" value={ctx.period} />
              <label className={label}>ตั้งรายสินค้า: ค้นหาสินค้าใน Odoo<Input name="pq" defaultValue={params.pq} placeholder="รหัส หรือ ชื่อ" className="mt-1 w-64" /></label>
              <Button type="submit" size="sm" variant="outline">ค้นหา</Button>
              {products.length > 0 && (
                <ul className="w-full space-y-1 text-xs">
                  {products.map((p) => <li key={p.id}><Link className="text-primary underline" href={`${PATH}?${ctxQuery(ctx, { pid: String(p.id), pname: p.name })}`}>{p.name}</Link> <span className="text-muted-foreground">{p.category}</span></li>)}
                </ul>
              )}
            </form>
            <form action={createRateAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {hidden}
              {Number.isInteger(pid) && pid > 0 ? (
                <p className="rounded-lg bg-muted p-2 text-sm sm:col-span-2 lg:col-span-4">
                  รายสินค้า: <b>{params.pname}</b> (#{pid}) <Link href={`${PATH}?${ctxQuery(ctx)}`} className="ml-2 text-xs text-primary underline">ยกเลิก ใช้หมวดสินค้าแทน</Link>
                  <input type="hidden" name="odooProductId" value={pid} /><input type="hidden" name="productName" value={params.pname ?? ''} />
                </p>
              ) : (
                categoryOptions.length > 0 ? (
                  <label className={`${label} sm:col-span-2`}>หมวดสินค้า (product category จาก Odoo)
                    <select name="category" defaultValue="*|*" className={input}>
                      <option value="*|*">ทุกหมวดสินค้า</option>
                      <optgroup label="หมวดสินค้าใน Odoo">
                        {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </optgroup>
                      {families.length > 0 && (
                        <optgroup label="กลุ่มสินค้า ทุกยี่ห้อ">
                          {families.map((f) => <option key={f} value={`*|${f}`}>ทุกยี่ห้อ-{f}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className={label}>ยี่ห้อ (ว่าง = ทุกยี่ห้อ)<input name="brand" list="brand-list" placeholder="เช่น AT" className={input} /></label>
                    <label className={label}>กลุ่มสินค้า (ว่าง = ทุกกลุ่ม)<input name="family" list="family-list" placeholder="เช่น PCR, TBR" className={input} /></label>
                    <p className="text-xs text-amber-700 sm:col-span-2">อ่านหมวดสินค้าจาก Odoo ไม่ได้ จึงให้พิมพ์ยี่ห้อ / กลุ่มสินค้าเอง</p>
                  </>
                )
              )}
              <label className={label}>Pricelist
                <select name="priceGroup" defaultValue="*" className={input}>
                  <option value="*">ทุก pricelist</option>
                  {pricelists.length > 0 && (
                    <optgroup label="Pricelist จาก Odoo (เฉพาะ pricelist นี้)">
                      {pricelists.map((p) => {
                        const group = groupOf.get(p.id);
                        return <option key={p.id} value={`pl:${p.id}|${p.name}`}>{p.name}{group ? ` · ${PRICE_GROUP_LABELS[group]}` : ''}</option>;
                      })}
                    </optgroup>
                  )}
                </select>
              </label>
              <label className={label}>ชนิด
                <select name="kind" defaultValue="PERCENT" className={input}>
                  <option value="PERCENT">% ของยอดก่อน VAT</option>
                  <option value="PER_UNIT">บาท ต่อหน่วยที่ขาย</option>
                </select>
              </label>
              <label className={label}>อัตรา<input name="value" type="number" inputMode="decimal" min="0" step="0.0001" required placeholder="0.9" className={input} /></label>
              <label className={label}>เริ่มใช้<input name="validFrom" type="date" required defaultValue={periodStart} className={input} /></label>
              <label className={label}>สิ้นสุด (ว่าง = ไม่กำหนด)<input name="validTo" type="date" className={input} /></label>
              <label className={label}>หมายเหตุ<input name="note" maxLength={200} className={input} /></label>
              <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" size="sm">เพิ่มอัตรา</Button></div>
            </form>
            <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
            <datalist id="family-list">{families.map((f) => <option key={f} value={f} />)}</datalist>
            <p className="mt-3 text-xs text-muted-foreground">หมวดสินค้าอ่านจาก product category ใน Odoo แบบ <code>ยี่ห้อ-กลุ่ม</code> เช่น AT-PCR (Austone), TM-WH (กระทะล้อ) · เลือก “ทุกยี่ห้อ-PCR” ถ้าอัตราเดียวกันทุกยี่ห้อ · วันที่มีผลเทียบกับวันที่เงินเข้า</p>
          </section>
        </>
      )}
    </div>
  );
}
