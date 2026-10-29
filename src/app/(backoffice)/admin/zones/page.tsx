import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as admin from '@/lib/admin/store';
import { getReferenceData, shortProvince } from '@/lib/shop/catalog';
import { deleteZoneAction, saveZoneAction } from '../actions';

/** Zone management: group provinces into price zones. */
export default async function ZonesPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { edit, error } = await searchParams;
  const [{ provinces }, zones] = [await getReferenceData(), await admin.listZones()];
  const editing = edit ? zones.find((z) => z.id === edit) : undefined;
  const allBooks = await admin.listBooks();
  const assigned = new Map<string, string>();
  for (const zone of zones) for (const p of zone.provinces) assigned.set(p, zone.id);
  const unassigned = provinces.filter((p) => !assigned.has(p.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">โซนราคา</h1>
        <p className="text-sm text-muted-foreground">จังหวัดหนึ่งอยู่ได้แค่โซนเดียว จังหวัดที่ไม่ถูกจัดจะใช้ราคาโซนค่าเริ่มต้น · โซนละ 3 ตารางราคา (S/M/L)</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          {zones.map((zone) => {
            const books = allBooks.filter((b) => b.zoneId === zone.id);
            return (
              <Card key={zone.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{zone.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {zone.isDefault ? `${unassigned.length} จังหวัดที่ยังไม่ถูกจัดโซน` : `${zone.provinces.length} จังหวัด`} · ตารางราคา {books.filter((b) => b.status === 'PUBLISHED').length}/{books.length} เผยแพร่แล้ว
                    </p>
                  </div>
                  {!zone.isDefault && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/admin/zones?edit=${zone.id}`} />}>แก้ไข</Button>
                      <form action={deleteZoneAction}><input type="hidden" name="id" value={zone.id} /><Button variant="ghost" size="sm" className="text-destructive">ลบ</Button></form>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1">
                  {(zone.isDefault ? unassigned.map((p) => p.name) : zone.provinces).map((p) => (
                    <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-xs">{shortProvince(p)}</span>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">{editing ? `แก้ไขโซน: ${editing.name}` : 'สร้างโซนใหม่'}</CardTitle></CardHeader>
          <CardContent>
            <form action={saveZoneAction} className="space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Input name="name" placeholder="ชื่อโซน เช่น ภาคเหนือตอนบน" defaultValue={editing?.name ?? ''} required maxLength={60} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">ติ๊กจังหวัด (จังหวัดที่อยู่โซนอื่นจะถูกย้ายมาโซนนี้)</p>
              <div className="grid max-h-[420px] grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-3">
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
                {editing && <Button variant="ghost" nativeButton={false} render={<Link href="/admin/zones" />}>ยกเลิก</Button>}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
