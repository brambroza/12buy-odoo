import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CreateUserForm, ResetPasswordButton } from '@/components/admin/credential-forms';
import * as admin from '@/lib/admin/store';
import type { CustomerGroup, PriceZone } from '@/lib/admin/types';
import { requireBackoffice } from '@/lib/auth/session';
import { ROLE_LABELS, isAdminRole, type Role } from '@/lib/auth/roles';
import { listDealers } from '@/lib/dealers/repo';
import { PROVINCES } from '@/lib/provinces';
import { getPartners } from '@/lib/shop/catalog';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, type DealerTier, type DealerType } from '@/lib/shop/types';
import { cn } from '@/lib/utils';
import { createDealerAction, createDealerUserAction, openAsDealerAction, resetPasswordAction, toggleUserActiveAction, updateDealerAction } from '../dealer-actions';

const TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];
const TIERS = Object.keys(DEALER_TIER_LABELS) as DealerTier[];
const STATUS = { PENDING: 'รออนุมัติ', ACTIVE: 'ใช้งาน', SUSPENDED: 'ระงับ' } as const;
type Status = keyof typeof STATUS;
const STATUS_CLASS: Record<Status, string> = { ACTIVE: 'bg-emerald-500/15 text-emerald-700', SUSPENDED: 'bg-destructive/15 text-destructive', PENDING: 'bg-amber-500/15 text-amber-700' };
const DEALER_ROLES = [{ value: 'DEALER_OWNER', label: 'เจ้าของร้าน' }, { value: 'DEALER_STAFF', label: 'พนักงานร้าน' }];

type Search = { q?: string; status?: string; open?: string; saved?: string; error?: string; fromLead?: string; new?: string };

/** Dealer management: approve, set type/tier/zone, link Odoo partner, create logins, impersonate. */
export default async function DealersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [actor, params] = await Promise.all([requireBackoffice(), searchParams]);
  const canEdit = isAdminRole(actor.role as Role);
  const status = (['PENDING', 'ACTIVE', 'SUSPENDED'] as Status[]).includes(params.status as Status) ? (params.status as Status) : undefined;
  const [dealers, settings, partners] = await Promise.all([listDealers({ status, q: params.q }), admin.getAdminSnapshot(), getPartners().catch(() => [])]);
  const counts = { PENDING: 0, ACTIVE: 0, SUSPENDED: 0 } as Record<Status, number>;
  for (const d of await listDealers()) counts[d.status as Status] += 1;
  const partnerName = (id: number | null) => partners.find((p) => p.id === id)?.name;
  // Salesperson lives on the Odoo customer (res.partner.user_id); web orders carry it so commission stays with the right person.
  const salesperson = (id: number) => { const p = partners.find((x) => x.id === id); return p?.user_id ? p.user_id[1] : null; };
  const { zones, groups } = settings;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ดีลเลอร์</h1>
          <p className="text-sm text-muted-foreground">อนุมัติร้าน กำหนดประเภท/ระดับ ผูกลูกค้า Odoo และสร้างบัญชีเข้าสู่ระบบให้ร้าน · โซนราคาคำนวณจากจังหวัด</p>
        </div>
        {canEdit && <Button nativeButton={false} render={<Link href="/admin/dealers?new=1" />} size="sm">+ เพิ่มดีลเลอร์</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['PENDING', 'ACTIVE', 'SUSPENDED'] as Status[]).map((s) => (
          <Link key={s} href={`/admin/dealers${status === s ? '' : `?status=${s}`}`} className={cn('rounded-full border px-3 py-1 text-xs font-medium', status === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{STATUS[s]} {counts[s]}</Link>
        ))}
        <form className="ml-auto flex gap-2"><Input name="q" defaultValue={params.q} placeholder="ค้นชื่อร้าน / จังหวัด / โทร" className="w-56" /><Button type="submit" variant="outline" size="sm">ค้นหา</Button></form>
      </div>
      {params.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>}
      {params.fromLead && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">อนุมัติใบสมัครแล้ว ขั้นต่อไป: สร้างบัญชีเข้าสู่ระบบให้ร้านด้านล่าง แล้วส่งรหัสทาง LINE</p>}

      {params.new && canEdit && (
        <details open className="rounded-xl border border-primary/40 bg-card">
          <summary className="cursor-pointer p-3 text-sm font-semibold">เพิ่มดีลเลอร์ใหม่</summary>
          <DealerForm action={createDealerAction} partners={partners} zones={zones} groups={groups} />
        </details>
      )}

      {dealers.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีดีลเลอร์{status ? `สถานะ${STATUS[status]}` : ''} · ใบสมัครใหม่อยู่ที่เมนู “ใบสมัครดีลเลอร์”</p>}

      <div className="space-y-2">
        {dealers.map((d) => {
          const zone = admin.zoneForProvince(d.province, zones);
          const book = admin.findBookIn(settings, zone.id, d.tier as DealerTier);
          const group = admin.groupForDealerIn(settings, d.id);
          const open = params.open === d.id;
          return (
            <details key={d.id} open={open} id={`dealer-${d.id}`} className="rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{d.name}</span>
                <Badge variant="outline" className={cn('border-transparent', STATUS_CLASS[d.status as Status])}>{STATUS[d.status as Status]}</Badge>
                {d.creditEnabled && <Badge variant="outline" className="border-transparent bg-sky-500/15 text-sky-700">ลูกค้าเครดิต</Badge>}
                {group && <Badge variant="outline">กลุ่ม {group.name}</Badge>}
                <span className="text-xs text-muted-foreground">{d.province} · โซน {zone.name} · {d.tier} · {d.types.map((t) => DEALER_TYPE_LABELS[t as DealerType]).join(', ')}</span>
                <span className="text-xs text-muted-foreground">{d.users.length} ผู้ใช้{d.odooPartnerId ? ` · Odoo: ${partnerName(d.odooPartnerId) ?? `#${d.odooPartnerId}`}` : ' · ยังไม่ผูก Odoo'}</span>
                {d.odooPartnerId && (salesperson(d.odooPartnerId)
                  ? <span className="text-xs text-muted-foreground">เซลล์: {salesperson(d.odooPartnerId)}</span>
                  : <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700">ยังไม่ตั้งเซลล์ใน Odoo</Badge>)}
                {open && params.saved && <span className="text-xs text-emerald-600">บันทึกแล้ว</span>}
                <form action={openAsDealerAction} className="ml-auto"><input type="hidden" name="dealerId" value={d.id} /><Button type="submit" size="sm" variant="outline">เปิดมุมมองดีลเลอร์</Button></form>
              </summary>
              <div className="space-y-4 border-t border-border p-3">
                {canEdit ? <DealerForm action={updateDealerAction} dealer={d} partners={partners} zones={zones} groups={groups} groupId={group?.id} /> : <p className="text-xs text-muted-foreground">เฉพาะแอดมินแก้ไขข้อมูลร้านได้</p>}
                <p className="text-xs text-muted-foreground">ราคาที่ร้านเห็น: {book?.status === 'PUBLISHED' ? `ตารางราคาเว็บ ${zone.name} / ${d.tier}` : `pricelist ของลูกค้าใน Odoo (ยังไม่มีตารางเว็บเผยแพร่สำหรับโซน ${zone.name} / ${d.tier})`}</p>

                <div className="rounded-lg border border-border">
                  <p className="border-b border-border px-3 py-2 text-sm font-semibold">บัญชีเข้าสู่ระบบของร้าน</p>
                  {d.users.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">ยังไม่มีบัญชี ร้านยังเข้าสู่ระบบไม่ได้</p>}
                  <ul className="divide-y divide-border text-sm">
                    {d.users.map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className={cn('font-medium', !u.isActive && 'line-through text-muted-foreground')}>{u.name}</span>
                        <span className="text-xs text-muted-foreground">{u.email} · {ROLE_LABELS[u.role as Role]}{u.mustChangePassword && ' · รอตั้งรหัสใหม่'}{u.lastLoginAt && ` · เข้าล่าสุด ${u.lastLoginAt.toLocaleDateString('th-TH')}`}</span>
                        {canEdit && (
                          <span className="ml-auto flex items-center gap-2">
                            <ResetPasswordButton action={resetPasswordAction} userId={u.id} />
                            <form action={toggleUserActiveAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="back" value={`/admin/dealers?open=${d.id}`} /><Button type="submit" size="xs" variant="ghost">{u.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</Button></form>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {canEdit && <div className="border-t border-border p-3"><CreateUserForm action={createDealerUserAction} hidden={{ dealerId: d.id }} roles={DEALER_ROLES} /></div>}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

type Partner = Awaited<ReturnType<typeof getPartners>>[number];
type DealerRow = Awaited<ReturnType<typeof listDealers>>[number];

/** Shared create/edit form. Province list is static so it works when Odoo is down. */
function DealerForm({ action, dealer, partners, zones, groups, groupId }: { action: (formData: FormData) => Promise<void>; dealer?: DealerRow; partners: Partner[]; zones: PriceZone[]; groups: CustomerGroup[]; groupId?: string }) {
  const field = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm';
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      {dealer && <input type="hidden" name="dealerId" value={dealer.id} />}
      <label className="text-xs font-medium">ชื่อร้าน<input name="name" defaultValue={dealer?.name} required maxLength={120} className={field} /></label>
      <label className="text-xs font-medium">จังหวัด
        <select name="province" defaultValue={dealer?.province ?? ''} required className={field}>
          <option value="" disabled>เลือกจังหวัด</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}{zones.find((z) => z.provinces.includes(p)) ? ` · โซน ${zones.find((z) => z.provinces.includes(p))!.name}` : ''}</option>)}
        </select>
      </label>
      <fieldset className="md:col-span-2">
        <legend className="text-xs font-medium">ประเภทสินค้าที่สั่งได้</legend>
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          {TYPES.map((t) => <label key={t} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 has-[:checked]:border-primary has-[:checked]:bg-primary/10"><input type="checkbox" name="types" value={t} defaultChecked={dealer ? dealer.types.includes(t) : t === 'CAR'} />{DEALER_TYPE_LABELS[t]}</label>)}
        </div>
      </fieldset>
      <label className="text-xs font-medium md:col-span-2">กลุ่มลูกค้า (สินค้าที่ร้านเห็น)
        <select name="customerGroupId" defaultValue={groupId ?? ''} className={field}>
          <option value="">ไม่จัดกลุ่ม · เห็นสินค้าทุกตัวในประเภทที่เลือก</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <span className="font-normal text-muted-foreground">ตั้งกลุ่มได้ที่เมนู “กลุ่มลูกค้า” · ร้านเห็นเฉพาะสินค้าที่อยู่ทั้งในประเภทที่เลือกและในกลุ่ม</span>
      </label>
      <label className="text-xs font-medium">ระดับดีลเลอร์
        <select name="tier" defaultValue={dealer?.tier ?? 'M'} className={field}>{TIERS.map((t) => <option key={t} value={t}>{t} · {DEALER_TIER_LABELS[t]}</option>)}</select>
      </label>
      <label className="text-xs font-medium">สถานะ
        <select name="status" defaultValue={dealer?.status ?? 'ACTIVE'} className={field}>{(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}</select>
      </label>
      <label className="text-xs font-medium md:col-span-2">ลูกค้าใน Odoo (res.partner)
        <select name="odooPartnerId" defaultValue={dealer?.odooPartnerId ?? ''} className={field}>
          <option value="">ยังไม่ผูก (ใช้ pricelist เริ่มต้น)</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.state_id ? ` · ${p.state_id[1].replace(/\s*\(TH\)$/, '').replace(/^จังหวัด/, '')}` : ''}{p.property_product_pricelist ? ` · ${p.property_product_pricelist[1]}` : ''}</option>)}
        </select>
      </label>
      <label className="flex items-start gap-2 rounded-lg border border-border p-2 text-xs md:col-span-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
        <input type="checkbox" name="creditEnabled" defaultChecked={dealer?.creditEnabled ?? false} className="mt-0.5" />
        <span><span className="font-medium">ลูกค้าเครดิต</span><span className="block text-muted-foreground">สั่งแบบเครดิตได้โดยไม่ต้องแนบสลิป · ถ้าเลือกจ่ายเงินสด ได้ส่วนต่างราคาเครดิต−เงินสดเป็นส่วนลดท้ายบิล (ตั้งคู่ราคาที่หน้าตารางราคา)</span></span>
      </label>
      <label className="text-xs font-medium">โทร<input name="phone" defaultValue={dealer?.phone ?? ''} maxLength={30} className={field} /></label>
      <label className="text-xs font-medium">LINE ID<input name="lineId" defaultValue={dealer?.lineId ?? ''} maxLength={60} className={field} /></label>
      <label className="text-xs font-medium">เลขผู้เสียภาษี<input name="taxId" defaultValue={dealer?.taxId ?? ''} maxLength={20} className={field} /></label>
      <label className="text-xs font-medium">ที่อยู่จัดส่ง<input name="address" defaultValue={dealer?.address ?? ''} maxLength={300} className={field} /></label>
      <label className="text-xs font-medium md:col-span-2">หมายเหตุภายใน<input name="notes" defaultValue={dealer?.notes ?? ''} maxLength={500} className={field} /></label>
      <div className="md:col-span-2"><Button type="submit" size="sm">{dealer ? 'บันทึก' : 'สร้างดีลเลอร์'}</Button></div>
    </form>
  );
}
