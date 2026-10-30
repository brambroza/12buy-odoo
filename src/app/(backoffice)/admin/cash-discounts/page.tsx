import Link from 'next/link';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, FilterChip, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { IconSubmit } from '@/components/admin/icon-submit';
import * as admin from '@/lib/admin/store';
import { cashDiscountProducts, formatCashDiscount } from '@/lib/admin/cash-discounts';
import { listHref, paginate } from '@/lib/admin/list';
import { requireAdmin } from '@/lib/auth/session';
import { baht, getCatalog } from '@/lib/shop/catalog';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { bulkCashDiscountAction, saveCashDiscountsAction } from '../cash-discount-actions';

type Params = { type?: string; q?: string; set?: string; page?: string; saved?: string; error?: string };

const PATH = '/admin/cash-discounts';
const TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];
const input = 'h-9 rounded-lg border border-border bg-background px-2 text-sm';

/**
 * Cash discount per Odoo product (% of the dealer's price or baht per base unit) for credit dealers
 * who pay cash. Comes after the % set on the dealer and before the pricelist % and pricelist pairs.
 */
export default async function CashDiscountsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const type = TYPES.includes(params.type as DealerType) ? (params.type as DealerType) : undefined;
  const q = (params.q ?? '').trim().slice(0, 80);
  const onlySet = params.set === '1';
  const [catalog, discounts] = await Promise.all([getCatalog(), admin.listProductCashDiscounts()]);
  const rows = cashDiscountProducts(catalog.products, discounts, { type, q, onlySet });
  const pageRows = paginate(rows, params.page);
  const setCount = Object.keys(discounts).length;
  const page = pageRows.page > 1 ? String(pageRows.page) : undefined;
  const filter = { type, q, set: onlySet ? '1' : undefined };
  /** List URL with the current filter and page; `changes` overrides them (a filter change resets the page). */
  const href = (changes: Record<string, string | undefined> = {}) => listHref(PATH, { ...filter, page }, changes);
  // Keeps the admin's filter and page across the actions' redirects.
  const keep = (
    <>
      {type && <input type="hidden" name="type" value={type} />}
      {q && <input type="hidden" name="q" value={q} />}
      {onlySet && <input type="hidden" name="set" value="1" />}
      {page && <input type="hidden" name="page" value={page} />}
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ส่วนลดเงินสดรายสินค้า</h1>
        <p className="text-sm text-muted-foreground">สินค้าทั้งหมดจาก Odoo · ใช้กับดีลเลอร์ที่ติ๊ก “ลูกค้าเครดิต” แล้วเลือกจ่ายเงินสด แสดงเป็นส่วนลดท้ายบิลตอน checkout</p>
        <p className="text-xs text-muted-foreground">ลำดับที่ใช้: % ที่ตั้งในข้อมูลดีลเลอร์ (ต่อกลุ่มสินค้า) → ค่าของสินค้าในหน้านี้ → % ของ pricelist และคู่ราคาที่ <Link href="/admin/prices?pairs=open" className="text-primary underline">ตารางราคา</Link></p>
      </div>

      {params.saved && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">บันทึกแล้ว</p>}
      {params.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip href={listHref(PATH, { q, set: filter.set })} active={!type}>ทุกประเภท</FilterChip>
        {TYPES.map((t) => <FilterChip key={t} href={listHref(PATH, { q, set: filter.set }, { type: t })} active={type === t}>{DEALER_TYPE_LABELS[t]}</FilterChip>)}
        <FilterChip href={listHref(PATH, { type, q }, { set: onlySet ? undefined : '1' })} active={onlySet}>ตั้งแล้ว {setCount}</FilterChip>
        <div className="w-full sm:ml-auto sm:w-auto">
          <ListSearch action={PATH} q={q} placeholder="ชื่อ รหัส ยี่ห้อ ขนาด" keep={{ type, set: filter.set }} clearHref={q ? listHref(PATH, { type, set: filter.set }) : undefined} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
        <form action={bulkCashDiscountAction} className="flex flex-1 flex-wrap items-center gap-2">
          {keep}
          <span className="font-medium">ตั้งให้ทุกสินค้าที่กรอง ({rows.length} รายการ)</span>
          <select name="bulkKind" defaultValue="PERCENT" aria-label="ชนิดส่วนลด" className={input}>
            <option value="PERCENT">%</option>
            <option value="BAHT">บาท/หน่วย</option>
          </select>
          <input name="bulkValue" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="เช่น 2" aria-label="ส่วนลด" className={`${input} w-28 text-right`} />
          <Button type="submit" size="sm" variant="outline" disabled={!rows.length}>ตั้งทั้งหมด</Button>
        </form>
        <form action={bulkCashDiscountAction} className="flex items-center gap-1 text-xs text-muted-foreground">
          {keep}
          <input type="hidden" name="clear" value="1" />
          ล้างค่าที่กรอง
          <IconSubmit label={`ล้างส่วนลดเงินสดของ ${rows.length} สินค้าที่กรอง`} tone="danger" confirm={`ล้างส่วนลดเงินสดของสินค้า ${rows.length} รายการที่กรองอยู่?`} disabled={!rows.length}><Eraser /></IconSubmit>
        </form>
      </div>

      <form action={saveCashDiscountsAction} className="space-y-3">
        {keep}
        <input type="hidden" name="ids" value={pageRows.items.map((p) => p.tmplId).join(',')} />
        <TableCard>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>สินค้า</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead className="text-right">ราคาตั้ง</TableHead>
                <TableHead>ส่วนลดเงินสด</TableHead>
                <TableHead className="text-right">ตัวอย่างจากราคาตั้ง</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <EmptyRow colSpan={5}>{onlySet ? 'ยังไม่มีสินค้าที่ตั้งส่วนลดเงินสด' : 'ไม่พบสินค้า'}</EmptyRow>}
              {pageRows.items.map((p) => {
                const current = discounts[String(p.tmplId)];
                const example = !current ? null : current.kind === 'PERCENT' ? p.listPrice * current.value / 100 : Math.min(current.value, p.listPrice);
                return (
                  <TableRow key={p.tmplId}>
                    <TableCell data-label="สินค้า" className="whitespace-normal">
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{[p.code, p.brand].filter(Boolean).join(' · ')}</span>
                    </TableCell>
                    <TableCell data-label="ประเภท" className="text-xs">{DEALER_TYPE_LABELS[p.dealerType]}</TableCell>
                    <TableCell data-label="ราคาตั้ง" className="text-right tabular-nums">{baht(p.listPrice)}</TableCell>
                    <TableCell data-label="ส่วนลดเงินสด">
                      <span className="flex items-center gap-1.5">
                        <select name={`kind_${p.tmplId}`} defaultValue={current?.kind ?? ''} aria-label={`ชนิดส่วนลด ${p.name}`} className={input}>
                          <option value="">ไม่ตั้ง</option>
                          <option value="PERCENT">%</option>
                          <option value="BAHT">บาท/{p.baseUnit}</option>
                        </select>
                        <input name={`value_${p.tmplId}`} type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={current?.value ?? ''} aria-label={`ส่วนลด ${p.name}`} className={`${input} w-24 text-right`} />
                      </span>
                    </TableCell>
                    <TableCell data-label="ตัวอย่าง" className="text-right text-xs tabular-nums">
                      {current && example !== null ? <span className="text-emerald-700">−{baht(example)} ({formatCashDiscount(current, p.baseUnit)})</span> : <span className="text-muted-foreground">ตาม pricelist</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ListPagination page={pageRows} href={(n) => href({ page: n > 1 ? String(n) : undefined, saved: undefined, error: undefined })} unit="สินค้า" />
          {pageRows.items.length > 0 && <Button type="submit" size="sm">บันทึกหน้านี้</Button>}
        </div>
        <p className="text-xs text-muted-foreground">บันทึกเฉพาะ {pageRows.items.length} รายการในหน้านี้ · ไม่ตั้ง หรือช่องว่าง = ใช้ % ของ pricelist · ตัวอย่างคิดจากราคาตั้งใน Odoo ร้านจริงคิดจากราคาของร้านนั้น</p>
      </form>
    </div>
  );
}
