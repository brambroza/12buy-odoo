import Link from 'next/link';
import Image from 'next/image';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, IconLink, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import * as admin from '@/lib/admin/store';
import type { AdminPromotion } from '@/lib/admin/types';
import { requireAdmin } from '@/lib/auth/session';
import { PROMOTIONS } from '@/lib/landing-content';
import { cn } from '@/lib/utils';
import { deletePromotionAction, savePromotionAction } from '../promotion-actions';

const PATH = '/admin/promotions';
/** Banner images shipped with the site (public/landing). */
const IMAGES = ['/landing/car-wide.webp', '/landing/moto-wide.webp', '/landing/battery-wide.webp', '/landing/hero-wide.webp'];
const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' });
const today = () => new Date().toISOString().slice(0, 10);

type Search = { edit?: string; new?: string; error?: string };

function status(p: AdminPromotion): { label: string; cls: string } {
  const day = today();
  if (!p.active) return { label: 'ซ่อน', cls: 'bg-muted text-muted-foreground' };
  if (p.to < day) return { label: 'หมดเวลา', cls: 'bg-muted text-muted-foreground' };
  if (p.from > day) return { label: 'รอเริ่ม', cls: 'bg-amber-500/15 text-amber-800' };
  return { label: 'แสดงอยู่', cls: 'bg-emerald-500/15 text-emerald-700' };
}

/** Landing-page promotion cards: what visitors and dealers see under "ราคาพิเศษดีลเลอร์เดือนนี้". */
export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [, params] = await Promise.all([requireAdmin(), searchParams]);
  const promos = await admin.listPromotions();
  const editing = params.edit ? promos.find((p) => p.id === params.edit) : undefined;
  const open = Boolean(params.new) || Boolean(editing);
  const usingDefaults = promos.length === 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Megaphone className="size-6" /> โปรโมชันหน้าแรก</h1>
          <p className="text-sm text-muted-foreground">การ์ดในหัวข้อ “ราคาพิเศษดีลเลอร์เดือนนี้” บนหน้าแรก แสดงเฉพาะที่เปิดอยู่และอยู่ในช่วงวันที่ · ไม่แสดงราคาต่อสาธารณะ</p>
        </div>
        <Button nativeButton={false} render={<Link href={`${PATH}?new=1`} />} size="sm"><Plus /> เพิ่มโปรโมชัน</Button>
      </div>
      {usingDefaults && (
        <p className="rounded-lg border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">ยังไม่มีโปรโมชันที่ตั้งเอง หน้าแรกจึงแสดงชุดเริ่มต้น {PROMOTIONS.length} ใบจากโค้ด เพิ่มของคุณเองแล้วชุดเริ่มต้นจะหายไป</p>
      )}
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รูป</TableHead>
              <TableHead>หัวข้อ</TableHead>
              <TableHead>ช่วงเวลา</TableHead>
              <TableHead>ลิงก์</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="w-24 text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promos.length === 0 && <EmptyRow colSpan={6}>ยังไม่มีโปรโมชัน</EmptyRow>}
            {promos.map((p) => {
              const st = status(p);
              return (
                <TableRow key={p.id}>
                  <TableCell data-label="รูป"><div className="relative h-10 w-16 overflow-hidden rounded bg-muted"><Image src={p.image} alt="" fill sizes="64px" className="object-cover" unoptimized={p.image.startsWith('http')} /></div></TableCell>
                  <TableCell data-label="หัวข้อ"><span className="font-medium">{p.title}</span><span className="block max-w-xs truncate text-xs text-muted-foreground">{p.body}</span></TableCell>
                  <TableCell data-label="ช่วงเวลา" className="text-xs">{fmt.format(new Date(p.from))} – {fmt.format(new Date(p.to))}</TableCell>
                  <TableCell data-label="ลิงก์" className="font-mono text-xs">{p.href}</TableCell>
                  <TableCell data-label="สถานะ"><Badge variant="outline" className={cn('border-transparent', st.cls)}>{st.label}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <IconLink href={`${PATH}?edit=${p.id}`} label="แก้ไข"><Pencil /></IconLink>
                      <form action={deletePromotionAction}><input type="hidden" name="id" value={p.id} /><IconSubmit label="ลบ" tone="danger" confirm={`ลบโปรโมชัน “${p.title}”?`}><Trash2 /></IconSubmit></form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      {open && (
        <UrlDrawer title={editing ? 'แก้ไขโปรโมชัน' : 'เพิ่มโปรโมชัน'} description="แสดงบนหน้าแรกตามช่วงวันที่ (รวมวันสิ้นสุด)" closeHref={PATH}>
          {params.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{params.error}</p>}
          <form action={savePromotionAction} className="space-y-3 text-sm">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="block text-xs font-medium">หัวข้อ<Input name="title" required maxLength={120} defaultValue={editing?.title} placeholder="ยางรถยนต์ Yokohama · Michelin" className="mt-1" /></label>
            <label className="block text-xs font-medium">รายละเอียดสั้น ๆ<Textarea name="body" required maxLength={300} rows={2} defaultValue={editing?.body} placeholder="ราคาพิเศษดีลเลอร์ประจำเดือน เข้าสู่ระบบเพื่อดูราคาของร้าน" className="mt-1" /></label>
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium">รูปภาพ</legend>
              <div className="grid grid-cols-4 gap-2">
                {IMAGES.map((img) => (
                  <label key={img} className="relative block aspect-[16/9] cursor-pointer overflow-hidden rounded-lg border-2 border-transparent has-[:checked]:border-primary">
                    <input type="radio" name="image" value={img} defaultChecked={(editing?.image ?? IMAGES[0]) === img} className="sr-only" />
                    <Image src={img} alt="" fill sizes="120px" className="object-cover" />
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">ต้องการรูปอื่น ส่งไฟล์ให้ทีม dev วางใน /public/landing แล้วเลือกได้ที่นี่</p>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium">เริ่ม<Input name="from" type="date" required defaultValue={editing?.from ?? today()} className="mt-1" /></label>
              <label className="block text-xs font-medium">สิ้นสุด<Input name="to" type="date" required defaultValue={editing?.to ?? today()} className="mt-1" /></label>
            </div>
            <label className="block text-xs font-medium">ลิงก์เมื่อกด<Input name="href" required defaultValue={editing?.href ?? '/tires?type=CAR'} placeholder="/tires?type=CAR" className="mt-1 font-mono" /></label>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} className="accent-primary" /> แสดงบนหน้าแรก</label>
              <label className="inline-flex items-center gap-2 text-xs">ลำดับ<Input name="sort" type="number" min={0} max={999} defaultValue={editing?.sort ?? ''} className="h-8 w-20" /></label>
            </div>
            <Button type="submit" size="sm">{editing ? 'บันทึก' : 'เพิ่ม'}</Button>
          </form>
        </UrlDrawer>
      )}
    </div>
  );
}
