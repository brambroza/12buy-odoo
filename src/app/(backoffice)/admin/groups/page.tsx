import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as admin from '@/lib/admin/store';
import type { CustomerGroup } from '@/lib/admin/types';
import { getCatalog } from '@/lib/shop/catalog';
import { DEALER_TYPE_LABELS, type CatalogProduct, type DealerType } from '@/lib/shop/types';
import { groupRestricts, isProductVisible } from '@/lib/shop/visibility';
import { deleteGroupAction, saveGroupAction } from '../actions';

type Params = { group?: string; saved?: string; error?: string; unknown?: string };
const TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

/** Products a group shows when its dealers may buy every product family. */
function visibleCount(products: CatalogProduct[], group: CustomerGroup): number {
  return products.filter((p) => isProductVisible(p, { types: TYPES, group })).length;
}

/** Customer groups: pick which brands / categories / products each group of dealers can see and order. */
export default async function GroupsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [catalog, groups, members] = [await getCatalog(), await admin.listGroups(), await admin.groupMemberCounts()];
  const editing = params.group ? await admin.getGroup(params.group) : undefined;
  const brands = [...new Set(catalog.products.map((p) => p.brand))].sort();
  const categories = [...new Map(catalog.products.map((p) => [p.categoryId, { id: p.categoryId, name: p.categoryName, type: p.dealerType }])).values()]
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const codeOf = new Map(catalog.products.map((p) => [p.tmplId, p.code]));
  const codes = (ids: number[]) => ids.map((id) => codeOf.get(id) ?? `#${id}`).join('\n');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">กลุ่มลูกค้า</h1>
        <p className="text-sm text-muted-foreground">กำหนดว่าร้านในแต่ละกลุ่มเห็นและสั่งสินค้าตัวไหนได้ · ร้านเห็นเฉพาะสินค้าที่อยู่ทั้งใน “ประเภทสินค้าที่สั่งได้” ของร้าน และในกลุ่ม · ผูกร้านเข้ากลุ่มที่หน้าดีลเลอร์</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-3">
          {groups.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีกลุ่ม · ร้านทุกร้านเห็นสินค้าทุกตัวในประเภทที่สั่งได้</p>}
          {groups.map((g) => (
            <Card key={g.id} className={g.id === editing?.id ? 'border-primary' : undefined}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{g.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {members.get(g.id) ?? 0} ร้าน · เห็น {visibleCount(catalog.products, g)} จาก {catalog.products.length} สินค้า
                    {!groupRestricts(g) && ' (ทุกยี่ห้อ)'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/admin/groups?group=${g.id}`} />}>แก้ไข</Button>
                  <form action={deleteGroupAction}><input type="hidden" name="id" value={g.id} /><Button variant="ghost" size="sm" className="text-destructive">ลบ</Button></form>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1 text-xs">
                {g.brands.map((b) => <span key={b} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{b}</span>)}
                {g.categoryIds.map((id) => <span key={id} className="rounded-full bg-muted px-2 py-0.5">{categories.find((c) => c.id === id)?.name ?? `#${id}`}</span>)}
                {g.includeTmplIds.length > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700">+{g.includeTmplIds.length} รายตัว</span>}
                {g.excludeTmplIds.length > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">−{g.excludeTmplIds.length} ซ่อน</span>}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">{editing ? `แก้ไขกลุ่ม: ${editing.name}` : 'สร้างกลุ่มใหม่'}</CardTitle></CardHeader>
          <CardContent>
            <form action={saveGroupAction} className="space-y-4" key={editing?.id ?? 'new'}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Input name="name" placeholder="ชื่อกลุ่ม เช่น ร้านยางเก๋ง ภาคเหนือ" defaultValue={editing?.name ?? ''} required maxLength={60} />
              {params.saved && <p className="text-sm text-emerald-600">บันทึกแล้ว</p>}
              {params.unknown && <p className="text-sm text-amber-700">ไม่พบรหัสสินค้า: {params.unknown}</p>}
              {params.error && <p className="text-sm text-destructive">{params.error}</p>}

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
                <div className="mt-2 grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-3">
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
                {editing && <Button variant="ghost" nativeButton={false} render={<Link href="/admin/groups" />}>ยกเลิก</Button>}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
