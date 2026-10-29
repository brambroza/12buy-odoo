import Link from 'next/link';
import { Archive, ArchiveRestore, Globe, GlobeLock, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, FilterChip, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { IconSubmit } from '@/components/admin/icon-submit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { requireAdmin } from '@/lib/auth/session';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { deliveryProducts, listAllCarriers, type DeliveryCarrier } from '@/lib/odoo/delivery-carrier';
import { odooWritesEnabled } from '@/lib/odoo/rpc';
import { cn } from '@/lib/utils';
import { saveCarrierAction, setCarrierActiveAction, setCarrierPublishedAction } from '../delivery-actions';

type Show = 'web' | 'all' | 'archived';
type Params = { show?: string; q?: string; page?: string; edit?: string; new?: string; error?: string };

const PATH = '/admin/delivery';
const SHOW_LABELS: Record<Show, string> = { web: 'เปิดบนเว็บ', all: 'ใช้งานอยู่ทั้งหมด', archived: 'ปิดใช้งาน' };
const selectClass = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal';
const labelClass = 'block text-sm font-medium';

/** True when the carrier belongs to the chosen tab and its name contains the (normalised) search text. */
function matches(carrier: DeliveryCarrier, show: Show, q: string): boolean {
  if (show === 'web' && !(carrier.active && carrier.published)) return false;
  if (show === 'all' && !carrier.active) return false;
  if (show === 'archived' && carrier.active) return false;
  return matchesSearch(q, carrier.name);
}

/** Odoo delivery methods (`delivery.carrier`): add, rename, reorder, publish (the first published is the default), archive — written to Odoo. */
export default async function DeliveryPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const show: Show = params.show === 'all' || params.show === 'archived' ? params.show : 'web';
  const q = (params.q ?? '').trim().slice(0, 60);
  const writable = odooWritesEnabled();

  let carriers: DeliveryCarrier[] = [];
  let loadError: string | null = null;
  try {
    carriers = await listAllCarriers();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'อ่านข้อมูลจาก Odoo ไม่ได้';
  }
  const visible = carriers.filter((c) => matches(c, show, searchText(q)));
  const pageRows = paginate(visible, params.page);
  const counts: Record<Show, number> = {
    web: carriers.filter((c) => c.active && c.published).length,
    all: carriers.filter((c) => c.active).length,
    archived: carriers.filter((c) => !c.active).length,
  };
  const editing = params.edit ? carriers.find((c) => c.id === Number(params.edit)) ?? null : null;
  const formOpen = writable && Boolean(editing || params.new);
  const products = deliveryProducts(carriers);
  const defaultCarrier = carriers.find((c) => c.active && c.published);

  const showParam = show !== 'web' ? show : undefined;
  const page = pageRows.page > 1 ? String(pageRows.page) : undefined;
  /** List URL with the current tab, search and page; `changes` overrides params such as `edit` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) => listHref(PATH, { show: showParam, q, page }, changes);
  const closeHref = href();
  // Keeps the admin's tab, search and page across the actions' redirects.
  const keep = (
    <>
      {showParam && <input type="hidden" name="show" value={showParam} />}
      {q && <input type="hidden" name="q" value={q} />}
      {page && <input type="hidden" name="page" value={page} />}
    </>
  );
  const errorBanner = params.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">การจัดส่ง</h1>
          <p className="text-sm text-muted-foreground">วิธีจัดส่งจาก Odoo (Sales → Delivery Methods) · แก้ที่นี่แล้วเขียนเข้า Odoo ทันที</p>
          <p className="text-xs text-muted-foreground">ดีลเลอร์เลือกเองไม่ได้: ออเดอร์ใช้การจัดส่งที่กำหนดให้ลูกค้าที่หน้า <Link href="/admin/dealers" className="text-primary underline">ดีลเลอร์ / ลูกค้า Odoo</Link> · ลูกค้าที่ยังไม่กำหนด ใช้ตัวแรก (ลำดับน้อยสุด) ที่เปิดบนเว็บ{defaultCarrier ? ` ตอนนี้คือ “${defaultCarrier.name}”` : ' (ตอนนี้ไม่มี ลูกค้าที่ยังไม่กำหนดจะสั่งซื้อไม่ได้)'} · ใบสั่งขายใน Odoo จะตั้ง Delivery Method ให้</p>
        </div>
        {writable && <Button size="sm" nativeButton={false} render={<Link href={href({ new: '1', edit: undefined, error: undefined })} scroll={false} />}><Plus /> เพิ่มการจัดส่ง</Button>}
      </div>

      {!writable && <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-800">Odoo อยู่ในโหมดอ่านอย่างเดียว (ODOO_READ_ONLY) · ดูรายการได้ แต่เพิ่ม/แก้/เปิดแสดงจากเว็บไม่ได้จนกว่าจะเปิดการเขียน</p>}
      {loadError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>}
      {!formOpen && errorBanner}

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SHOW_LABELS) as Show[]).map((key) => (
          <FilterChip key={key} href={listHref(PATH, { q }, { show: key !== 'web' ? key : undefined })} active={key === show}>
            {SHOW_LABELS[key]} {counts[key]}
          </FilterChip>
        ))}
        <div className="w-full sm:ml-auto sm:w-auto">
          <ListSearch action={PATH} q={q} placeholder="ค้นหาชื่อ" keep={{ show: showParam }} clearHref={q ? listHref(PATH, { show: showParam }) : undefined} />
        </div>
      </div>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-16">ลำดับ</TableHead>
              <TableHead>ชื่อ</TableHead>
              <TableHead>สถานะ</TableHead>
              {writable && <TableHead><span className="sr-only">จัดการ</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <EmptyRow colSpan={writable ? 4 : 3}>
                {show === 'web' && !q ? 'ยังไม่มีวิธีจัดส่งที่เปิดบนเว็บ ลูกค้าที่ยังไม่กำหนดการจัดส่งจะสั่งซื้อไม่ได้ · ไปที่ “ใช้งานอยู่ทั้งหมด” แล้วกด “เปิดบนเว็บ”' : 'ไม่พบรายการ'}
              </EmptyRow>
            )}
            {pageRows.items.map((c) => (
              <TableRow key={c.id} data-state={editing?.id === c.id ? 'selected' : undefined}>
                <TableCell data-label="ลำดับ" className="text-xs text-muted-foreground tabular-nums">#{c.sequence}</TableCell>
                <TableCell data-label="ชื่อ" className="whitespace-normal">
                  {writable ? <Link href={href({ edit: String(c.id), new: undefined, error: undefined })} scroll={false} className="font-medium hover:underline">{c.name}</Link> : <span className="font-medium">{c.name}</span>}
                </TableCell>
                <TableCell data-label="สถานะ">
                  <span className="flex flex-wrap gap-1">
                    {c.id === defaultCarrier?.id && <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">ค่าเริ่มต้น</Badge>}
                    {c.published && c.active && <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">เปิดบนเว็บ</Badge>}
                    {!c.active && <Badge variant="outline">ปิดใช้งาน</Badge>}
                  </span>
                </TableCell>
                {writable && (
                  <TableCell data-label="">
                    <span className="flex justify-end gap-1">
                      {c.active && (
                        <form action={setCarrierPublishedAction}>
                          {keep}
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="name" value={c.name} />
                          <input type="hidden" name="published" value={String(!c.published)} />
                          <IconSubmit label={c.published ? 'ปิดบนเว็บ' : 'เปิดบนเว็บ'}>{c.published ? <GlobeLock /> : <Globe />}</IconSubmit>
                        </form>
                      )}
                      <IconLink href={href({ edit: String(c.id), new: undefined, error: undefined })} label="แก้ไข"><Pencil /></IconLink>
                      <form action={setCarrierActiveAction}>
                        {keep}
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="name" value={c.name} />
                        <input type="hidden" name="active" value={String(!c.active)} />
                        {c.active
                          ? <IconSubmit label="ปิดใช้งาน" tone="danger" confirm={`ปิดใช้งาน “${c.name}” ใน Odoo? ลูกค้าที่ตั้งการจัดส่งนี้จะใช้ค่าเริ่มต้นแทน`}><Archive /></IconSubmit>
                          : <IconSubmit label="เปิดใช้งาน"><ArchiveRestore /></IconSubmit>}
                      </form>
                    </span>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: n > 1 ? String(n) : undefined })} unit="วิธีจัดส่ง" />

      {formOpen && (
        <UrlDrawer key={editing ? `edit-${editing.id}` : 'new'} title={editing ? `แก้ไข: ${editing.name}` : 'เพิ่มการจัดส่ง'} description={editing ? `Odoo delivery.carrier #${editing.id}` : 'เขียนเข้า Odoo ทันทีเมื่อกดเพิ่ม'} closeHref={closeHref}>
          {errorBanner}
          <form action={saveCarrierAction} className="grid gap-3 sm:grid-cols-2">
            {keep}
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className={cn(labelClass, 'sm:col-span-2')}>ชื่อ
              <Input name="name" required maxLength={120} defaultValue={editing?.name ?? ''} placeholder="เช่น สหนำโชค สาย 4" className="mt-1" />
            </label>
            <label className={labelClass}>ลำดับ (น้อยขึ้นก่อน)
              <Input name="sequence" type="number" min={0} max={10000} defaultValue={editing?.sequence ?? 10} className="mt-1" />
            </label>
            {!editing && (
              <label className={labelClass}>สินค้าค่าขนส่ง (Odoo บังคับ)
                <select name="productId" required defaultValue={products[0]?.id} className={selectClass}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.count} วิธี)</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="published" defaultChecked={editing ? editing.published : false} className="size-4" /> เปิดบนเว็บ (ใช้เป็นค่าเริ่มต้นได้เมื่อลำดับน้อยสุด)
            </label>
            {!editing && <p className="text-xs text-muted-foreground sm:col-span-2">สร้างเป็นราคาคงที่ 0 บาท (ไม่คิดค่าส่งในบิล) เหมือนวิธีจัดส่งที่มีอยู่</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">{editing ? 'บันทึก' : 'เพิ่ม'}</Button>
              <Button variant="ghost" nativeButton={false} render={<Link href={closeHref} scroll={false} />}>ยกเลิก</Button>
            </div>
          </form>
        </UrlDrawer>
      )}
    </div>
  );
}
