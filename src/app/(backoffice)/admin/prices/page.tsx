import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import * as admin from '@/lib/admin/store';
import type { PriceBook, PriceZone } from '@/lib/admin/types';
import { pricelistNameFor } from '@/lib/admin/dry-run';
import { baht, getCatalog, priceFor, searchProducts, shortProvince } from '@/lib/shop/catalog';
import { priceFromBook } from '@/lib/shop/pricing';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, type DealerTier, type DealerType } from '@/lib/shop/types';
import { cn } from '@/lib/utils';
import { approveBookAction, clearEntriesAction, dryRunAction, importByTypeAction, importPricesAction, openBookAction, rejectBookAction, republishBookAction, saveBookSettingsAction, saveCashPairsAction, saveGridAction, submitBookAction } from '../actions';

type Params = { book?: string; type?: string; q?: string; saved?: string; dryrun?: string; published?: string; submitted?: string; rejected?: string; imported?: string; error?: string; pairs?: string };
const STATUS_BADGE = {
  DRAFT: { label: 'ร่าง', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  PENDING_APPROVAL: { label: 'รออนุมัติ', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  PUBLISHED: { label: 'เผยแพร่แล้ว', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
} as const;
/** Guess which existing Odoo pricelist seeds each product family (by name). */
function guessPricelist(pricelists: { id: number; name: string }[], type: DealerType): number | undefined {
  const pattern = { CAR: /PCR/i, TRUCK: /TBR/i, MOTORCYCLE: /\bMC\b/i, BATTERY: /แบต|battery/i, WHEEL: /ล้อ|wheel/i }[type];
  return pricelists.find((p) => pattern.test(p.name) && /cash/i.test(p.name))?.id ?? pricelists.find((p) => pattern.test(p.name))?.id;
}
const TIERS: DealerTier[] = ['S', 'M', 'L'];
const TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

/** Price master: zone × tier grid, import from Odoo pricelist, dry-run diff, publish. */
export default async function PricesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [catalog, zones, books] = [await getCatalog(), await admin.listZones(), await admin.listBooks()];
  const book = params.book ? books.find((b) => b.id === params.book) : undefined;
  const zone = book ? zones.find((z) => z.id === book.zoneId) : undefined;
  const type = TYPES.includes(params.type as DealerType) ? (params.type as DealerType) : undefined;
  const query = params.q ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ตารางราคาดีลเลอร์</h1>
        <p className="text-sm text-muted-foreground">เว็บเป็นเจ้าของราคา · 1 ช่อง (โซน × ขนาดดีลเลอร์) = 1 pricelist ของเว็บใน Odoo เมื่ออนุมัติ · pricelist เดิมใน Odoo ไม่ถูกแก้</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-3">โซน</th>{TIERS.map((t) => <th key={t} className="p-3">{t} · {DEALER_TIER_LABELS[t]}</th>)}</tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id} className="border-t border-border">
                <td className="p-3 font-medium">{z.name}<span className="block text-xs font-normal text-muted-foreground">{z.isDefault ? 'จังหวัดที่ไม่ถูกจัดโซน' : `${z.provinces.length} จังหวัด`}</span></td>
                {TIERS.map((t) => {
                  const b = books.find((x) => x.zoneId === z.id && x.tier === t);
                  const active = b && b.id === book?.id;
                  return (
                    <td key={t} className="p-2">
                      {b ? (
                        <Link href={`/admin/prices?book=${b.id}`} className={cn('block rounded-lg border p-2', active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
                          <Badge variant="outline" className={cn('border-transparent', STATUS_BADGE[b.status].cls)}>{STATUS_BADGE[b.status].label}</Badge>
                          <span className="block text-xs text-muted-foreground">{Object.keys(b.entries).length} ราคาคงที่</span>
                        </Link>
                      ) : (
                        <form action={openBookAction}>
                          <input type="hidden" name="zoneId" value={z.id} /><input type="hidden" name="tier" value={t} />
                          <Button type="submit" variant="outline" size="sm" className="w-full">+ สร้าง</Button>
                        </form>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CashPairs pricelists={catalog.pricelists} saved={Boolean(params.pairs)} />

      {book && zone && (
        <BookEditor book={book} zone={zone} catalog={catalog} type={type} query={query} params={params} />
      )}
    </div>
  );
}

/**
 * Credit ↔ cash pricelist pairs. A credit dealer who pays cash gets the price
 * difference between the two as an end-of-bill discount.
 */
async function CashPairs({ pricelists, saved }: { pricelists: { id: number; name: string }[]; saved: boolean }) {
  const pairs = await admin.listCashPairs();
  const credits = pricelists.filter((p) => /credit/i.test(p.name) || pairs.some((x) => x.creditPricelistId === p.id));
  return (
    <details className="rounded-xl border border-border bg-card" open={saved || pairs.length === 0}>
      <summary className="cursor-pointer p-3 text-sm font-semibold">ส่วนลดเงินสดของลูกค้าเครดิต <span className="font-normal text-muted-foreground">· {pairs.length} คู่</span></summary>
      <form action={saveCashPairsAction} className="space-y-2 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">ร้านที่ตั้งเป็นลูกค้าเครดิตแล้วเลือกจ่ายเงินสด จะได้ส่วนลดท้ายบิล = ราคา pricelist เครดิตของร้าน − ราคา pricelist เงินสดที่จับคู่ไว้ (คิดรายสินค้า)</p>
        {credits.length === 0 && <p className="text-xs text-muted-foreground">ไม่พบ pricelist ที่ชื่อมีคำว่า Credit ใน Odoo</p>}
        {credits.map((credit) => {
          const current = admin.cashPricelistFor(credit.id, pairs);
          const suggested = current ?? admin.suggestCashPair(credit, pricelists);
          return (
            <label key={credit.id} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_auto_1fr]">
              <span className="font-medium">{credit.name}</span>
              <span className="text-xs text-muted-foreground">จ่ายสดใช้ราคา</span>
              <span className="flex items-center gap-2">
                <select name={`cash_${credit.id}`} defaultValue={suggested ?? ''} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  <option value="">ไม่มีส่วนลดเงินสด</option>
                  {pricelists.filter((p) => p.id !== credit.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {current === null && suggested !== null && <span className="shrink-0 text-xs text-amber-600">แนะนำ ยังไม่บันทึก</span>}
              </span>
            </label>
          );
        })}
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="outline">บันทึกคู่ราคา</Button>
          {saved && <span className="text-xs text-emerald-600">บันทึกแล้ว</span>}
        </div>
      </form>
    </details>
  );
}

function BookEditor({ book, zone, catalog, type, query, params }: {
  book: PriceBook; zone: PriceZone;
  catalog: Awaited<ReturnType<typeof getCatalog>>; type?: DealerType; query: string; params: Params;
}) {
  const products = searchProducts(catalog, { query, types: TYPES, type }).sort((a, b) => a.dealerType.localeCompare(b.dealerType) || a.brand.localeCompare(b.brand) || (a.size?.label ?? '').localeCompare(b.size?.label ?? ''));
  const basePricelist = catalog.pricelists.find((p) => p.id === book.basePricelistId);
  const hidden = <><input type="hidden" name="bookId" value={book.id} />{type && <input type="hidden" name="type" value={type} />}{query && <input type="hidden" name="q" value={query} />}</>;
  const filterHref = (next: { type?: DealerType; q?: string }) => {
    const sp = new URLSearchParams({ book: book.id });
    const t = 'type' in next ? next.type : type; const q = 'q' in next ? next.q : query;
    if (t) sp.set('type', t); if (q) sp.set('q', q);
    return `/admin/prices?${sp.toString()}`;
  };
  const dry = book.lastDryRun;

  return (
    <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{zone.name} · {book.tier} {DEALER_TIER_LABELS[book.tier]}</h2>
          <p className="text-xs text-muted-foreground">จะเผยแพร่เป็น pricelist ชื่อ <span className="font-mono">{pricelistNameFor(zone, book)}</span> · {zone.isDefault ? 'ใช้กับจังหวัดที่ไม่ถูกจัดโซน' : zone.provinces.map(shortProvince).join(', ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {params.saved && <span className="text-emerald-600">บันทึกแล้ว</span>}
          {params.imported && <span className="text-emerald-600">นำเข้า {params.imported} รายการ</span>}
          {params.submitted && <span className="text-blue-600">ส่งอนุมัติแล้ว</span>}
          {params.rejected && <span className="text-amber-600">ส่งกลับแก้ไข</span>}
          {params.published && <span className="text-emerald-600">อนุมัติแล้ว ดีลเลอร์ในโซนนี้เห็นราคาใหม่ทันที</span>}
          {params.error && <span className="text-destructive">{params.error}</span>}
          <Badge variant="outline" className={cn('border-transparent', STATUS_BADGE[book.status].cls)}>{STATUS_BADGE[book.status].label}{book.status === 'DRAFT' && ' (ยังไม่มีผลกับดีลเลอร์)'}</Badge>
        </div>
      </div>

      <form action={saveBookSettingsAction} className="grid gap-3 rounded-lg bg-muted/40 p-3 md:grid-cols-[1fr_auto]">
        <input type="hidden" name="bookId" value={book.id} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs">
            <span className="font-medium">ราคาฐานจาก Odoo pricelist</span>
            <select name="basePricelistId" defaultValue={book.basePricelistId} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
              {catalog.pricelists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
            <span className="text-muted-foreground">สินค้าที่ไม่ได้กรอกราคาคงที่จะใช้ราคานี้ + % ด้านขวา</span>
          </label>
          {TYPES.map((t) => (
            <label key={t} className="text-xs">
              <span className="font-medium">{DEALER_TYPE_LABELS[t]} ปรับ %</span>
              <Input name={`pct_${t}`} type="number" step="0.5" defaultValue={book.typePercent[t] ?? ''} placeholder="0" className="mt-1 h-9" />
            </label>
          ))}
        </div>
        <Button type="submit" variant="outline" className="self-end">บันทึกการตั้งค่า</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Link href={filterHref({ type: undefined })} className={cn('rounded-full border px-3 py-1 text-xs', !type ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>ทุกประเภท</Link>
          {TYPES.map((t) => <Link key={t} href={filterHref({ type: t })} className={cn('rounded-full border px-3 py-1 text-xs', type === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{DEALER_TYPE_LABELS[t]}</Link>)}
        </div>
        <form className="flex gap-1" action="/admin/prices">
          <input type="hidden" name="book" value={book.id} />{type && <input type="hidden" name="type" value={type} />}
          <Input name="q" defaultValue={query} placeholder="ค้นขนาด/ชื่อ" className="h-8 w-40" />
          <Button type="submit" variant="outline" size="sm">กรอง</Button>
        </form>
        <div className="ml-auto flex gap-1">
          <form action={importPricesAction}>{hidden}<Button type="submit" variant="outline" size="sm">คัดลอกราคาฐานลงช่องที่กรอง ({products.length} รายการ)</Button></form>
          <form action={clearEntriesAction}><input type="hidden" name="bookId" value={book.id} /><Button type="submit" variant="ghost" size="sm" className="text-destructive">ล้างราคาคงที่ทั้งหมด</Button></form>
        </div>
      </div>

      {Object.keys(book.entries).length === 0 && (
        <form action={importByTypeAction} className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <input type="hidden" name="bookId" value={book.id} />
          <p className="text-sm font-semibold">นำเข้าราคาเริ่มต้นจาก pricelist เดิมใน Odoo (ทำครั้งแรกต่อตาราง)</p>
          <p className="text-xs text-muted-foreground">เลือก pricelist ต้นทางแยกตามประเภทสินค้า ระบบคัดลอกราคาทุกรายการเป็นราคาคงที่ แล้วค่อยปรับรายตัว/ตั้ง % ทีหลัง</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {TYPES.map((t) => (
              <label key={t} className="text-xs">
                <span className="font-medium">{DEALER_TYPE_LABELS[t]}</span>
                <select name={`pl_${t}`} defaultValue={guessPricelist(catalog.pricelists, t) ?? ''} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  <option value="">— ข้าม —</option>
                  {catalog.pricelists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          <Button type="submit" size="sm">นำเข้า</Button>
        </form>
      )}

      <form action={saveGridAction}>
        {hidden}
        <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr><th className="p-2">สินค้า</th><th className="p-2">ประเภท</th><th className="p-2 text-right">ราคาตั้ง (Odoo)</th><th className="p-2 text-right">ฐาน {basePricelist?.name ?? ''}</th><th className="p-2 text-right">ราคาคงที่ (กรอก)</th><th className="p-2 text-right">ดีลเลอร์เห็น</th></tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const base = priceFor(catalog, p, book.basePricelistId);
                const entry = book.entries[String(p.tmplId)];
                const effective = priceFromBook(catalog, p, book);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-2"><span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.size && <span className="font-semibold">{p.size.label}</span>} <span className="text-muted-foreground">{p.name}</span></td>
                    <td className="p-2 text-xs">{DEALER_TYPE_LABELS[p.dealerType]}</td>
                    <td className="p-2 text-right text-muted-foreground">{baht(p.listPrice)}</td>
                    <td className="p-2 text-right text-muted-foreground">{baht(base)}</td>
                    <td className="p-2 text-right"><input name={`price_${p.tmplId}`} inputMode="decimal" defaultValue={entry ?? ''} placeholder="—" className="h-8 w-24 rounded-md border border-border bg-background px-2 text-right tabular-nums" /></td>
                    <td className={cn('p-2 text-right font-semibold tabular-nums', entry !== undefined ? 'text-primary' : '')}>{baht(effective)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit">บันทึกราคาที่กรอก</Button>
          <span className="text-xs text-muted-foreground">ช่องว่าง = ไม่กำหนดราคาคงที่ ใช้ราคาฐาน + % · ค่าที่กรอกจะชนะ % เสมอ</span>
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={dryRunAction} className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <input type="hidden" name="bookId" value={book.id} />
          <p className="text-sm font-semibold">1. ตรวจสิ่งที่จะถูกเขียนลง Odoo (dry run, อ่านอย่างเดียว)</p>
          <label className="block text-xs">
            เทียบกับ pricelist ใน Odoo (ไม่เลือก = pricelist ของตารางนี้{book.odooPricelistId ? ` #${book.odooPricelistId}` : ' ซึ่งยังไม่มี จะสร้างใหม่'})
            <select name="targetPricelistId" defaultValue={dry?.targetPricelistId && dry.targetPricelistId !== book.odooPricelistId ? dry.targetPricelistId : ''} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
              <option value="">— pricelist ของตารางนี้ —</option>
              {catalog.pricelists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
          </label>
          <Button type="submit" variant="outline" size="sm">คำนวณ diff</Button>
          {dry && (
            <div className="space-y-1 text-xs">
              <p className="text-muted-foreground">ผลล่าสุด {new Date(dry.at).toLocaleString('th-TH')}: สร้าง {dry.create.length} · แก้ {dry.update.length} · ลบ {dry.unlink.length} · เท่าเดิม {dry.unchanged}</p>
              <ul className="max-h-40 space-y-0.5 overflow-auto rounded bg-muted/40 p-2 font-mono">
                {dry.create.slice(0, 50).map((c) => <li key={`c${c.tmplId}`} className="text-emerald-700">+ {c.name} = {baht(c.price)}</li>)}
                {dry.update.slice(0, 50).map((u) => <li key={`u${u.tmplId}`} className="text-amber-700">~ {u.name}: {baht(u.from)} → {baht(u.to)}</li>)}
                {dry.unlink.slice(0, 50).map((d) => <li key={`d${d.tmplId}`} className="text-destructive">- {d.name} ({baht(d.price)})</li>)}
              </ul>
            </div>
          )}
        </form>
        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-semibold">2. ส่งอนุมัติ → 3. อนุมัติ (คนละคน) → เผยแพร่</p>
          <p className="text-xs text-muted-foreground">ดีลเลอร์ในโซน <b>{zone.name}</b> ขนาด <b>{book.tier}</b> จะเห็นราคาจากตารางนี้หลังอนุมัติ · ตอนอนุมัติระบบเขียนราคาลง pricelist ของตารางนี้ใน Odoo (ราคาคงที่รายสินค้า + % ต่อหมวดจาก pricelist ฐาน) และใบสั่งขายจากเว็บจะใช้ pricelist นี้ · ยังไม่ได้ผูกกับลูกค้าใน Odoo</p>
          {book.status === 'DRAFT' && (
            <form action={submitBookAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="bookId" value={book.id} />
              <Input name="person" placeholder="ชื่อผู้ส่งอนุมัติ" className="h-9 w-44" required />
              <Button type="submit" variant="outline">ส่งอนุมัติ</Button>
            </form>
          )}
          {book.status === 'PENDING_APPROVAL' && (
            <div className="space-y-2">
              <p className="text-xs">ส่งโดย <b>{book.submittedBy}</b> · diff: สร้าง {dry?.create.length ?? 0} · แก้ {dry?.update.length ?? 0} · ลบ {dry?.unlink.length ?? 0}</p>
              <form action={approveBookAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="bookId" value={book.id} />
                <Input name="person" placeholder="ชื่อผู้อนุมัติ (ต้องไม่ใช่ผู้ส่ง)" className="h-9 w-56" required />
                <Button type="submit">อนุมัติและเผยแพร่</Button>
              </form>
              <form action={rejectBookAction}><input type="hidden" name="bookId" value={book.id} /><Button type="submit" variant="ghost" size="sm" className="text-destructive">ส่งกลับแก้ไข</Button></form>
            </div>
          )}
          {book.status === 'PUBLISHED' && (
            <p className="text-xs text-emerald-700">เผยแพร่แล้ว {book.publishedAt && new Date(book.publishedAt).toLocaleString('th-TH')} · ส่งโดย {book.submittedBy ?? '—'} · อนุมัติโดย {book.approvedBy ?? '—'} · แก้ไขใดๆ จะกลับเป็นร่างและต้องอนุมัติใหม่</p>
          )}
          {book.odooPublish && (
            <div className={cn('rounded-lg px-3 py-2 text-xs', book.odooPublish.status === 'DONE' ? 'bg-emerald-500/10 text-emerald-700' : book.odooPublish.status === 'SKIPPED' ? 'bg-amber-500/10 text-amber-800' : 'bg-destructive/10 text-destructive')}>
              <p className="font-medium">
                Odoo: {book.odooPublish.status === 'DONE' ? `เขียน pricelist #${book.odooPublish.pricelistId} แล้ว (สร้าง ${book.odooPublish.created} · แก้ ${book.odooPublish.updated} · ลบ ${book.odooPublish.removed})` : book.odooPublish.status === 'SKIPPED' ? 'ยังไม่ได้เขียน' : 'เขียนไม่สำเร็จ'}
                {' · '}{new Date(book.odooPublish.at).toLocaleString('th-TH')}
              </p>
              {book.odooPublish.error && <p>{book.odooPublish.error}</p>}
            </div>
          )}
          {book.status === 'PUBLISHED' && (
            <form action={republishBookAction}><input type="hidden" name="bookId" value={book.id} /><Button type="submit" variant="outline" size="sm">{book.odooPublish?.status === 'DONE' ? 'ส่งราคาเข้า Odoo อีกครั้ง' : 'ส่งราคาเข้า Odoo'}</Button></form>
          )}
        </div>
      </div>
    </section>
  );
}
