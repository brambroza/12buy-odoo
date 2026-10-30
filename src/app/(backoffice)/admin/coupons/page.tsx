import Link from 'next/link';
import { Archive, ArchiveRestore, Plus, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { IconSubmit } from '@/components/admin/icon-submit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { listCodePrograms, listProgramCards } from '@/lib/odoo/loyalty';
import { odooWritesEnabled } from '@/lib/odoo/rpc';
import { requireAdmin } from '@/lib/auth/session';
import { listDealers } from '@/lib/dealers/repo';
import { getCatalog } from '@/lib/shop/catalog';
import { cn } from '@/lib/utils';
import { createCouponProgramAction, generateCouponsAction, setCouponProgramActiveAction } from '../coupon-actions';

const TYPE_LABELS: Record<string, string> = {
  coupons: 'คูปอง (โค้ดใช้ครั้งเดียว)',
  promo_code: 'โค้ดส่วนลด',
  promotion: 'โปรโมชัน',
  buy_x_get_y: 'ซื้อ X แถม Y',
  next_order_coupons: 'คูปองครั้งถัดไป',
  gift_card: 'บัตรของขวัญ',
  ewallet: 'eWallet',
  loyalty: 'สะสมแต้ม',
};

type Params = { new?: string; error?: string; program?: string; q?: string; page?: string; cpage?: string };
type Kind = 'promo_code' | 'coupons';
type ProgramRow = Awaited<ReturnType<typeof listCodePrograms>>[number];

const PATH = '/admin/coupons';
const selectClass = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal';
const labelClass = 'text-sm font-medium';

/** True when the web cart can apply the program: exactly one reward and it is a discount. */
const webSupported = (rewards: ProgramRow['rewards']) => rewards.length === 1 && rewards[0].reward_type === 'discount';

/** Codes or coupon count, end date, usage and pricelist limits of a program, as one short line. */
function programSummary({ program, codes, couponCount }: ProgramRow): string {
  return [
    codes.length ? `โค้ด: ${codes.join(', ')}` : `${couponCount} คูปอง`,
    program.date_to && `ถึง ${program.date_to.slice(0, 10)}`,
    program.limit_usage && program.max_usage > 0 && `ใช้แล้ว ${program.total_order_count}/${program.max_usage}`,
    program.pricelist_ids.length > 0 && `จำกัด ${program.pricelist_ids.length} pricelist`,
  ].filter(Boolean).join(' · ');
}

/** Odoo Loyalty programs dealers use with a code: overview, plus create / archive / generate coupons (written to Odoo). */
export default async function CouponsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const kind: Kind = params.new === 'coupons' ? 'coupons' : 'promo_code';
  const writable = odooWritesEnabled();
  const selectedId = Number(params.program) || null;

  let programs: ProgramRow[] = [];
  let error: string | null = null;
  try {
    programs = await listCodePrograms();
  } catch (e) {
    error = e instanceof Error ? e.message : 'อ่านข้อมูลจาก Odoo ไม่ได้';
  }
  const categories = await getCatalog()
    .then((catalog) => [...new Map(catalog.products.map((p) => [p.categoryId, { id: p.categoryId, name: p.categoryName }])).values()].sort((a, b) => a.name.localeCompare(b.name)))
    .catch(() => []);
  const dealers = (await listDealers({ status: 'ACTIVE' }).catch(() => [])).filter((d) => d.odooPartnerId);
  const selected = programs.find((p) => p.program.id === selectedId) ?? null;
  const cards = selected && selected.program.program_type === 'coupons' ? await listProgramCards(selected.program.id).catch(() => null) : null;

  const q = searchText(params.q);
  const visible = programs.filter((p) => matchesSearch(q, p.program.name, ...p.codes));
  const pageRows = paginate(visible, params.page);
  const page = pageRows.page > 1 ? String(pageRows.page) : undefined;
  /** List URL with the current search and page; `changes` opens a drawer (`program`, `new`) or moves pages. */
  const href = (changes: Record<string, string | undefined> = {}) => listHref(PATH, { q: params.q, page }, changes);
  const closeHref = href();
  // Keeps the admin's search and page across the actions' redirects.
  const keep = (
    <>
      {params.q && <input type="hidden" name="q" value={params.q} />}
      {page && <input type="hidden" name="page" value={page} />}
    </>
  );
  const creating = Boolean(params.new);
  const errorBanner = params.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>;

  const dealerSelect = (
    <label className={labelClass}>เฉพาะร้าน (ไม่เลือก = ร้านไหนก็ใช้ได้)
      <select name="dealerId" defaultValue="" className={selectClass}>
        <option value="">ทุกร้าน</option>
        {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">คูปอง / โค้ดส่วนลด</h1>
          <p className="text-sm text-muted-foreground">สร้างจากหน้านี้ได้เลย ระบบเขียนเข้า Odoo (Sales → Discount &amp; Loyalty) ทันที · โปรแกรมที่สร้างใน Odoo เองก็แสดงที่นี่</p>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href={href({ new: 'promo_code', program: undefined })} scroll={false} />}><Plus /> เพิ่มโปรแกรม</Button>
      </div>
      <details className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">เว็บรองรับ</summary>
        <p className="mt-1">โปรแกรมที่ใช้โค้ด (Trigger: with code) และมีรางวัลเป็นส่วนลด 1 แบบ: ลดเป็น % · ลดเป็นบาท · ลดตามแต้ม · ทั้งบิล / เฉพาะสินค้า-หมวดที่เลือก / ชิ้นที่ถูกที่สุด · ขั้นต่ำยอด/จำนวน · จำกัดวันที่ · จำกัดกลุ่มราคา (pricelist) · คูปองเฉพาะลูกค้า</p>
        <p>ยังไม่รองรับ: แถมสินค้า, ส่งฟรี, หลายรางวัลให้เลือก, เงื่อนไขสินค้าแบบ tag หรือ domain กำหนดเอง</p>
      </details>
      {!writable && <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-800">Odoo อยู่ในโหมดอ่านอย่างเดียว (ODOO_READ_ONLY) · ดูรายการได้ แต่สร้าง/ปิดโปรแกรมจากเว็บไม่ได้จนกว่าจะเปิดการเขียน</p>}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!creating && errorBanner}

      <div className="flex sm:justify-end">
        <ListSearch action={PATH} q={params.q} placeholder="ค้นชื่อโปรแกรม / โค้ด" clearHref={params.q ? PATH : undefined} />
      </div>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>โปรแกรม</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>โค้ด / คูปอง · เงื่อนไข</TableHead>
              <TableHead>รางวัล</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!error && programs.length === 0 && <EmptyRow colSpan={5}>ยังไม่มีโปรแกรมที่ใช้โค้ดใน Odoo</EmptyRow>}
            {programs.length > 0 && visible.length === 0 && <EmptyRow colSpan={5}>ไม่พบโปรแกรมตามคำค้น</EmptyRow>}
            {pageRows.items.map((row) => {
              const { program, rewards } = row;
              const supported = webSupported(rewards);
              const openHref = href({ program: String(program.id), cpage: undefined, new: undefined });
              return (
                <TableRow key={program.id} data-state={program.id === selectedId ? 'selected' : undefined}>
                  <TableCell data-label="โปรแกรม" className="whitespace-normal">
                    <Link href={openHref} scroll={false} className={cn('block font-medium hover:underline', !program.active && 'text-muted-foreground line-through')}>{program.name}</Link>
                    <span className="text-xs text-muted-foreground">{TYPE_LABELS[program.program_type] ?? program.program_type}</span>
                  </TableCell>
                  <TableCell data-label="สถานะ">
                    <span className="flex flex-wrap gap-1">
                      {!program.active && <Badge variant="outline" className="border-transparent bg-muted">ปิดใช้งาน</Badge>}
                      <Badge variant="outline" className={cn('border-transparent', supported ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700')}>{supported ? 'ใช้บนเว็บได้' : 'ยังใช้บนเว็บไม่ได้'}</Badge>
                    </span>
                  </TableCell>
                  <TableCell data-label="โค้ด / คูปอง · เงื่อนไข" className="whitespace-normal text-xs text-muted-foreground">{programSummary(row)}</TableCell>
                  <TableCell data-label="รางวัล" className="whitespace-normal text-xs">{rewards.map((r) => r.description || r.reward_type).join(' · ')}</TableCell>
                  <TableCell data-label="">
                    <span className="flex justify-end gap-1">
                      {program.program_type === 'coupons' && <IconLink href={openHref} label="ดูโค้ด"><Ticket /></IconLink>}
                      {writable && (
                        <form action={setCouponProgramActiveAction}>
                          {keep}
                          <input type="hidden" name="programId" value={program.id} />
                          <input type="hidden" name="active" value={String(!program.active)} />
                          {program.active
                            ? <IconSubmit label="ปิดใช้งาน" tone="danger" confirm={`ปิดใช้งาน “${program.name}”? โค้ดของโปรแกรมนี้จะใช้ในตะกร้าไม่ได้`}><Archive /></IconSubmit>
                            : <IconSubmit label="เปิดใช้งาน"><ArchiveRestore /></IconSubmit>}
                        </form>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: n > 1 ? String(n) : undefined })} unit="โปรแกรม" />

      {selected && !creating && (() => {
        const cardPage = cards ? paginate(cards, params.cpage) : null;
        const isCoupons = selected.program.program_type === 'coupons';
        return (
          <UrlDrawer key={`program-${selected.program.id}`} title={isCoupons ? `คูปองของ ${selected.program.name}` : selected.program.name}
            description={`${TYPE_LABELS[selected.program.program_type] ?? selected.program.program_type} · ${programSummary(selected)}`} closeHref={closeHref}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {!selected.program.active && <Badge variant="outline" className="border-transparent bg-muted">ปิดใช้งาน</Badge>}
              <Badge variant="outline" className={cn('border-transparent', webSupported(selected.rewards) ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700')}>{webSupported(selected.rewards) ? 'ใช้บนเว็บได้' : 'ยังใช้บนเว็บไม่ได้'}</Badge>
              <span className="text-muted-foreground">{selected.rewards.map((r) => r.description || r.reward_type).join(' · ')}</span>
            </div>
            {!isCoupons && <p className="text-sm text-muted-foreground">ไม่มีรายการโค้ด (โค้ดส่วนลดใช้โค้ดเดียว{selected.codes.length ? `: ${selected.codes.join(', ')}` : ''})</p>}
            {isCoupons && cards === null && <p className="text-sm text-destructive">อ่านรายการคูปองจาก Odoo ไม่ได้</p>}
            {cards && cards.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีคูปอง</p>}
            {cardPage && cards && cards.length > 0 && (
              <>
                <TableCard>
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>โค้ด</TableHead>
                        <TableHead>ร้าน</TableHead>
                        <TableHead>หมดอายุ</TableHead>
                        <TableHead className="text-right">สถานะ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cardPage.items.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell data-label="โค้ด" className="font-mono select-all">{c.code}</TableCell>
                          <TableCell data-label="ร้าน" className="text-muted-foreground">{c.partner_id ? c.partner_id[1] : 'ทุกร้าน'}</TableCell>
                          <TableCell data-label="หมดอายุ" className="text-muted-foreground">{c.expiration_date ? `ถึง ${c.expiration_date}` : ''}</TableCell>
                          <TableCell data-label="สถานะ" className="text-right">{c.points > 0 ? 'ยังไม่ใช้' : 'ใช้แล้ว'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCard>
                <ListPagination page={cardPage} href={(n) => href({ program: String(selected.program.id), cpage: n > 1 ? String(n) : undefined })} unit="คูปอง (ล่าสุด 200 ใบ)" />
              </>
            )}
            {writable && isCoupons && (
              <form action={generateCouponsAction} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
                {keep}
                <input type="hidden" name="programId" value={selected.program.id} />
                <p className="text-sm font-semibold sm:col-span-2">สร้างคูปองเพิ่ม</p>
                <label className={labelClass}>จำนวน (ใบ)<Input name="count" type="number" min={1} max={500} defaultValue={10} required className="mt-1" /></label>
                <label className={labelClass}>หมดอายุ<Input name="expirationDate" type="date" className="mt-1" /></label>
                <div className="sm:col-span-2">{dealerSelect}</div>
                <Button type="submit" variant="outline" className="sm:col-span-2">สร้างคูปองเพิ่ม</Button>
              </form>
            )}
          </UrlDrawer>
        );
      })()}

      {creating && (
        <UrlDrawer key="new"title="สร้างโปรแกรมใหม่" description={kind === 'promo_code' ? 'โค้ดเดียว ร้านไหนก็กรอกได้ เช่น YEAREND5' : 'Odoo สร้างโค้ดให้ทีละหลายใบ แต่ละใบใช้ได้ครั้งเดียว ผูกกับร้านได้'} closeHref={closeHref}>
          <div className="flex gap-1">
            {(['promo_code', 'coupons'] as const).map((k) => (
              <Button key={k} variant={k === kind ? 'default' : 'outline'} size="sm" nativeButton={false} render={<Link href={href({ new: k, program: undefined })} scroll={false} replace />}>{TYPE_LABELS[k]}</Button>
            ))}
          </div>
          {errorBanner}
          <form action={createCouponProgramAction} className="space-y-3" key={kind}>
            {keep}
            <input type="hidden" name="kind" value={kind} />
            <label className={cn(labelClass, 'block')}>ชื่อโปรแกรม<Input name="name" required maxLength={80} placeholder="เช่น ลด 5% ปลายปี" className="mt-1" /></label>

            {kind === 'promo_code' ? (
              <label className={cn(labelClass, 'block')}>โค้ด<Input name="code" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_\-]{3,30}" placeholder="YEAREND5" className="mt-1 font-mono" />
                <span className="text-xs font-normal text-muted-foreground">ร้านต้องพิมพ์ตรงตัว รวมตัวพิมพ์เล็ก/ใหญ่</span>
              </label>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={labelClass}>จำนวนคูปอง (ใบ)<Input name="count" type="number" min={1} max={500} defaultValue={10} required className="mt-1" /></label>
                {dealerSelect}
              </div>
            )}

            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-semibold">ส่วนลด</legend>
              <label className={labelClass}>จำนวน<MoneyInput name="discount" required className="mt-1" /></label>
              <label className={labelClass}>หน่วย
                <select name="mode" defaultValue="percent" className={selectClass}>
                  <option value="percent">% ของยอด</option>
                  <option value="per_order">บาท ต่อบิล</option>
                </select>
              </label>
              <label className={labelClass}>ลดที่
                <select name="applicability" defaultValue="order" className={selectClass}>
                  <option value="order">ทั้งบิล</option>
                  <option value="cheapest">ชิ้นที่ถูกที่สุด</option>
                  <option value="specific">เฉพาะหมวดสินค้า</option>
                </select>
              </label>
              <label className={labelClass}>หมวด (ถ้าเลือก “เฉพาะหมวด”)
                <select name="categoryId" defaultValue="" className={selectClass}>
                  <option value="">-</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className={labelClass}>ลดสูงสุด (บาท, เฉพาะ %)<MoneyInput name="maxAmount" placeholder="ไม่จำกัด" className="mt-1" /></label>
            </fieldset>

            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-semibold">เงื่อนไข</legend>
              {kind === 'promo_code' && (
                <>
                  <label className={labelClass}>ยอดขั้นต่ำ (บาท)<MoneyInput name="minimumAmount" placeholder="ไม่มี" className="mt-1" /></label>
                  <label className={labelClass}>จำนวนขั้นต่ำ (ชิ้น)<Input name="minimumQty" type="number" min={0} step="1" placeholder="ไม่มี" className="mt-1" /></label>
                </>
              )}
              <label className={labelClass}>เริ่ม<Input name="dateFrom" type="date" className="mt-1" /></label>
              <label className={labelClass}>สิ้นสุด{kind === 'coupons' && ' (= วันหมดอายุคูปอง)'}<Input name="dateTo" type="date" className="mt-1" /></label>
              <label className={labelClass}>ใช้ได้ทั้งหมด (ครั้ง)<Input name="maxUsage" type="number" min={0} step="1" placeholder="ไม่จำกัด" className="mt-1" /></label>
            </fieldset>

            <Button type="submit" disabled={!writable} className="w-full">สร้างใน Odoo</Button>
          </form>
        </UrlDrawer>
      )}
    </div>
  );
}
