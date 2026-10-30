import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { requireAdmin } from '@/lib/auth/session';
import * as admin from '@/lib/admin/store';
import type { CustomerGroup } from '@/lib/admin/types';
import { getCatalog } from '@/lib/shop/catalog';
import { DEALER_TYPE_LABELS, type CatalogProduct, type DealerType } from '@/lib/shop/types';
import { groupRestricts, isProductVisible } from '@/lib/shop/visibility';
import { deleteGroupAction, saveGroupAction } from '../actions';

const PATH = '/admin/groups';
const TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

type Search = { q?: string; page?: string; group?: string; new?: string; saved?: string; error?: string; unknown?: string };
type Category = { id: number; name: string; type: DealerType };

/** Products a group shows when its dealers may buy every product family. */
function visibleCount(products: CatalogProduct[], group: CustomerGroup): number {
  return products.filter((p) => isProductVisible(p, { types: TYPES, group })).length;
}

/** Customer groups: pick which brands / categories / products each group of dealers can see and order. */
export default async function GroupsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const [catalog, groups, members, editing] = await Promise.all([
    getCatalog(), admin.listGroups(), admin.groupMemberCounts(), params.group ? admin.getGroup(params.group) : Promise.resolve(undefined),
  ]);
  const brands = [...new Set(catalog.products.map((p) => p.brand))].sort();
  const categories: Category[] = [...new Map(catalog.products.map((p) => [p.categoryId, { id: p.categoryId, name: p.categoryName, type: p.dealerType }])).values()]
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const codeOf = new Map(catalog.products.map((p) => [p.tmplId, p.code]));
  /** Product codes (one per line) for the include/exclude textareas. */
  const codes = (ids: number[]) => ids.map((id) => codeOf.get(id) ?? `#${id}`).join('\n');

  const q = searchText(params.q);
  const filtered = groups.filter((g) => matchesSearch(q, g.name, ...g.brands, ...g.categoryIds.map((id) => categoryName.get(id))));
  const pageRows = paginate(filtered, params.page);
  /** List URL with the current search/page; `changes` overrides params such as `group`, `new` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) => listHref(PATH, { q: params.q, page: params.page }, changes);
  const closeHref = href();
  const drawerOpen = Boolean(editing || params.new);

  const notice = (
    <>
      {params.saved && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">บันทึกแล้ว</p>}
      {params.unknown && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800">ไม่พบรหัสสินค้า: {params.unknown}</p>}
      {params.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">กลุ่มลูกค้า</h1>
          <p className="text-sm text-muted-foreground">กำหนดว่าร้านในแต่ละกลุ่มเห็นและสั่งสินค้าตัวไหนได้ · ร้านเห็นเฉพาะสินค้าที่อยู่ทั้งใน “ประเภทสินค้าที่สั่งได้” ของร้าน และในกลุ่ม · ผูกร้านเข้ากลุ่มที่หน้าดีลเลอร์</p>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href={href({ new: '1' })} scroll={false} />}><Plus /> เพิ่มกลุ่ม</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ListSearch action={PATH} q={params.q} placeholder="ค้นชื่อกลุ่ม / ยี่ห้อ / หมวด" clearHref={params.q ? PATH : undefined} />
      </div>
      {!drawerOpen && notice}

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>กลุ่ม</TableHead>
              <TableHead className="text-right">ร้าน</TableHead>
              <TableHead>สินค้าที่เห็น</TableHead>
              <TableHead>เงื่อนไข</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.items.length === 0 && (
              <EmptyRow colSpan={5}>{groups.length === 0 ? 'ยังไม่มีกลุ่ม · ร้านทุกร้านเห็นสินค้าทุกตัวในประเภทที่สั่งได้' : 'ไม่พบกลุ่มตามคำค้น'}</EmptyRow>
            )}
            {pageRows.items.map((g) => {
              const memberCount = members.get(g.id) ?? 0;
              const visible = `เห็น ${visibleCount(catalog.products, g)} จาก ${catalog.products.length} สินค้า${groupRestricts(g) ? '' : ' (ทุกยี่ห้อ)'}`;
              const editHref = href({ group: g.id, new: undefined });
              return (
                <TableRow key={g.id} data-state={editing?.id === g.id ? 'selected' : undefined}>
                  <TableCell data-label="กลุ่ม" className="whitespace-normal">
                    <Link href={editHref} scroll={false} className="font-medium hover:underline">{g.name}</Link>
                  </TableCell>
                  <TableCell data-label="ร้าน" className="text-right">{memberCount}</TableCell>
                  <TableCell data-label="สินค้าที่เห็น" className="text-xs text-muted-foreground">{visible}</TableCell>
                  <TableCell data-label="เงื่อนไข" className="min-w-64 whitespace-normal"><GroupChips group={g} categoryName={categoryName} /></TableCell>
                  <TableCell data-label="">
                    <span className="flex justify-end gap-1">
                      <IconLink href={editHref} label="แก้ไข"><Pencil /></IconLink>
                      <form action={deleteGroupAction}>
                        <input type="hidden" name="id" value={g.id} />
                        <IconSubmit label="ลบ" tone="danger" confirm={`ลบกลุ่ม “${g.name}”?${memberCount ? ` ร้าน ${memberCount} ร้านในกลุ่มนี้จะเห็นสินค้าทุกตัวในประเภทที่สั่งได้` : ''}`}><Trash2 /></IconSubmit>
                      </form>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: String(n) })} unit="กลุ่ม" />

      {drawerOpen && (
        <UrlDrawer
          key={editing?.id ?? 'new'}
          title={editing ? `แก้ไขกลุ่ม: ${editing.name}` : 'สร้างกลุ่มใหม่'}
          description={editing ? `${members.get(editing.id) ?? 0} ร้าน · เห็น ${visibleCount(catalog.products, editing)} จาก ${catalog.products.length} สินค้า` : undefined}
          closeHref={closeHref}
          size="lg"
        >
          {notice}
          <form action={saveGroupAction} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="block text-sm font-semibold">ชื่อกลุ่ม
              <Input name="name" placeholder="ชื่อกลุ่ม เช่น ร้านยางเก๋ง ภาคเหนือ" defaultValue={editing?.name ?? ''} required maxLength={60} className="mt-1" />
            </label>

            <fieldset>
              <legend className="text-sm font-semibold">ยี่ห้อ</legend>
              <p className="text-xs text-muted-foreground">ไม่ติ๊กเลยทั้งยี่ห้อ หมวด และรายตัว = เห็นทุกสินค้า</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {brands.map((b) => (
                  <label key={b} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                    <input type="checkbox" name="brands" value={b} defaultChecked={editing?.brands.includes(b)} />{b}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">หมวดสินค้าใน Odoo</legend>
              <div className="mt-2 grid max-h-72 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-3">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={editing?.categoryIds.includes(c.id)} className="size-4" />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto truncate text-[10px] text-muted-foreground">{DEALER_TYPE_LABELS[c.type]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">เพิ่มรายตัว (รหัสสินค้า)
                <Textarea name="include" rows={5} defaultValue={editing ? codes(editing.includeTmplIds) : ''} placeholder={'บรรทัดละรหัส\nเห็นเสมอ แม้อยู่นอกยี่ห้อ/หมวดที่ติ๊ก'} className="mt-1 font-mono text-xs" />
              </label>
              <label className="text-sm font-semibold">ซ่อนรายตัว (รหัสสินค้า)
                <Textarea name="exclude" rows={5} defaultValue={editing ? codes(editing.excludeTmplIds) : ''} placeholder={'บรรทัดละรหัส\nไม่เห็นเสมอ ชนะทุกเงื่อนไข'} className="mt-1 font-mono text-xs" />
              </label>
            </div>

            <div className="flex gap-2">
              <Button type="submit">{editing ? 'บันทึก' : 'สร้างกลุ่ม'}</Button>
              <Button variant="ghost" nativeButton={false} render={<Link href={closeHref} scroll={false} />}>ยกเลิก</Button>
            </div>
          </form>
        </UrlDrawer>
      )}
    </div>
  );
}

/** Brand / category / include / exclude chips summarising what a group shows. */
function GroupChips({ group: g, categoryName }: { group: CustomerGroup; categoryName: Map<number, string> }) {
  const empty = !g.brands.length && !g.categoryIds.length && !g.includeTmplIds.length && !g.excludeTmplIds.length;
  return (
    <span className="flex flex-wrap gap-1 text-xs">
      {g.brands.map((b) => <span key={b} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{b}</span>)}
      {g.categoryIds.map((id) => <span key={id} className="rounded-full bg-muted px-2 py-0.5">{categoryName.get(id) ?? `#${id}`}</span>)}
      {g.includeTmplIds.length > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700">+{g.includeTmplIds.length} รายตัว</span>}
      {g.excludeTmplIds.length > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">−{g.excludeTmplIds.length} ซ่อน</span>}
      {empty && <span className="text-muted-foreground">—</span>}
    </span>
  );
}
