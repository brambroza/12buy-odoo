import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { requireAdmin } from '@/lib/auth/session';
import * as admin from '@/lib/admin/store';
import type { PriceZone } from '@/lib/admin/types';
import { getReferenceData, shortProvince } from '@/lib/shop/catalog';
import { deleteZoneAction, saveZoneAction } from '../actions';

const PATH = '/admin/zones';
/** Province chips shown per row before collapsing the rest into "+N". */
const CHIP_LIMIT = 8;

type Search = { q?: string; page?: string; edit?: string; new?: string; error?: string };
type Province = Awaited<ReturnType<typeof getReferenceData>>['provinces'][number];

/** Zone management: group provinces into price zones. */
export default async function ZonesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const [{ provinces }, zones, allBooks] = await Promise.all([getReferenceData(), admin.listZones(), admin.listBooks()]);
  const assigned = new Map<string, string>();
  for (const zone of zones) for (const p of zone.provinces) assigned.set(p, zone.id);
  const unassigned = provinces.filter((p) => !assigned.has(p.name)).map((p) => p.name);
  /** Provinces a zone covers; the default zone covers every province not assigned elsewhere. */
  const provincesOf = (zone: PriceZone) => (zone.isDefault ? unassigned : zone.provinces);

  const q = searchText(params.q);
  const filtered = zones.filter((z) => matchesSearch(q, z.name, ...provincesOf(z).map(shortProvince)));
  const pageRows = paginate(filtered, params.page);
  /** List URL with the current search/page; `changes` overrides params such as `edit`, `new` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) => listHref(PATH, { q: params.q, page: params.page }, changes);
  const closeHref = href();

  const editing = params.edit ? zones.find((z) => z.id === params.edit && !z.isDefault) : undefined;
  const drawerOpen = Boolean(editing || params.new);
  const errorBanner = params.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">โซนราคา</h1>
          <p className="text-sm text-muted-foreground">จังหวัดหนึ่งอยู่ได้แค่โซนเดียว จังหวัดที่ไม่ถูกจัดจะใช้ราคาโซนค่าเริ่มต้น · โซนละ 3 ตารางราคา (S/M/L)</p>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href={href({ new: '1', edit: undefined, error: undefined })} scroll={false} />}><Plus /> เพิ่มโซน</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ListSearch action={PATH} q={params.q} placeholder="ค้นชื่อโซน / จังหวัด" clearHref={params.q ? PATH : undefined} />
      </div>
      {!drawerOpen && errorBanner}

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>โซน</TableHead>
              <TableHead>จังหวัด</TableHead>
              <TableHead>ตารางราคา</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.items.length === 0 && <EmptyRow colSpan={4}>ไม่พบโซนตามคำค้น</EmptyRow>}
            {pageRows.items.map((zone) => {
              const books = allBooks.filter((b) => b.zoneId === zone.id);
              const published = books.filter((b) => b.status === 'PUBLISHED').length;
              const list = provincesOf(zone);
              const editHref = href({ edit: zone.id, new: undefined, error: undefined });
              return (
                <TableRow key={zone.id} data-state={editing?.id === zone.id ? 'selected' : undefined}>
                  <TableCell data-label="โซน" className="whitespace-normal">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {zone.isDefault
                        ? <span className="font-medium">{zone.name}</span>
                        : <Link href={editHref} scroll={false} className="font-medium hover:underline">{zone.name}</Link>}
                      {zone.isDefault && <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">ค่าเริ่มต้น</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {zone.isDefault ? `${list.length} จังหวัดที่ยังไม่ถูกจัดโซน` : `${list.length} จังหวัด`}
                    </span>
                  </TableCell>
                  <TableCell data-label="จังหวัด" className="min-w-64 whitespace-normal">
                    <span className="flex flex-wrap gap-1">
                      {list.slice(0, CHIP_LIMIT).map((p) => <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-xs">{shortProvince(p)}</span>)}
                      {list.length > CHIP_LIMIT && <span className="rounded-full px-1 py-0.5 text-xs text-muted-foreground" title={list.slice(CHIP_LIMIT).map(shortProvince).join(', ')}>+{list.length - CHIP_LIMIT}</span>}
                      {list.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </span>
                  </TableCell>
                  <TableCell data-label="ตารางราคา" className="text-xs">{published}/{books.length} เผยแพร่แล้ว</TableCell>
                  <TableCell data-label="">
                    {!zone.isDefault && (
                      <span className="flex justify-end gap-1">
                        <IconLink href={editHref} label="แก้ไข"><Pencil /></IconLink>
                        <form action={deleteZoneAction}>
                          <input type="hidden" name="id" value={zone.id} />
                          <IconSubmit label="ลบ" tone="danger" confirm={`ลบโซน “${zone.name}”? จังหวัดในโซนนี้จะกลับไปใช้โซนเริ่มต้น`}><Trash2 /></IconSubmit>
                        </form>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: String(n) })} unit="โซน" />

      {drawerOpen && (
        <UrlDrawer
          key={editing?.id ?? 'new'}
          title={editing ? `แก้ไขโซน: ${editing.name}` : 'สร้างโซนใหม่'}
          description={editing ? `${editing.provinces.length} จังหวัด` : undefined}
          closeHref={closeHref}
          size="lg"
        >
          {errorBanner}
          <ZoneForm editing={editing} provinces={provinces} zones={zones} assigned={assigned} closeHref={closeHref} />
        </UrlDrawer>
      )}
    </div>
  );
}

/** Create/edit form: zone name plus the province checklist (provinces owned by another zone show its name). */
function ZoneForm({ editing, provinces, zones, assigned, closeHref }: {
  editing?: PriceZone; provinces: Province[]; zones: PriceZone[]; assigned: Map<string, string>; closeHref: string;
}) {
  return (
    <form action={saveZoneAction} className="space-y-4">
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <label className="block text-sm font-semibold">ชื่อโซน
        <Input name="name" placeholder="ชื่อโซน เช่น ภาคเหนือตอนบน" defaultValue={editing?.name ?? ''} required maxLength={60} className="mt-1" />
      </label>
      <p className="text-xs text-muted-foreground">ติ๊กจังหวัด (จังหวัดที่อยู่โซนอื่นจะถูกย้ายมาโซนนี้)</p>
      <div className="grid max-h-[60vh] grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-3 lg:grid-cols-4">
        {provinces.map((p) => {
          const owner = assigned.get(p.name);
          const checked = editing ? editing.provinces.includes(p.name) : false;
          return (
            <label key={p.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
              <input type="checkbox" name="provinces" value={p.name} defaultChecked={checked} className="size-4" />
              <span className="truncate">{shortProvince(p.name)}</span>
              {owner && owner !== editing?.id && <span className="ml-auto truncate text-[10px] text-muted-foreground">{zones.find((z) => z.id === owner)?.name}</span>}
            </label>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button type="submit">{editing ? 'บันทึก' : 'สร้างโซน'}</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href={closeHref} scroll={false} />}>ยกเลิก</Button>
      </div>
    </form>
  );
}
