import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import { Badge } from '@/components/ui/badge';
import { CreateUserForm, ResetPasswordButton } from '@/components/admin/credential-forms';
import * as admin from '@/lib/admin/store';
import type { CustomerGroup, PriceZone } from '@/lib/admin/types';
import { requireBackoffice } from '@/lib/auth/session';
import { ROLE_LABELS, isAdminRole, type Role } from '@/lib/auth/roles';
import { listDealers } from '@/lib/dealers/repo';
import { getOdooPartnerKinds, listOdooCustomers, listOdooPricelists, sameCreditLimit, type OdooCustomer, type OdooPartnerKind, type OdooPricelistOption } from '@/lib/odoo/customer-pricing';
import { listAllCarriers, type DeliveryCarrier } from '@/lib/odoo/delivery-carrier';
import { odooWritesEnabled } from '@/lib/odoo/rpc';
import { PROVINCES } from '@/lib/provinces';
import { baht, getPartners } from '@/lib/shop/catalog';
import { webCreditUsed } from '@/lib/shop/credit';
import { listOpenCreditOrders } from '@/lib/shop/store';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, type DealerTier, type DealerType } from '@/lib/shop/types';
import { DealerAvatar } from '@/components/shop/dealer-avatar';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { ExportMenu } from '@/components/admin/export-menu';
import { DealerNameField, type ExistingShop } from '@/components/admin/dealer-name-field';
import { formatTaxId } from '@/lib/tax-id';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, FilterChip, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { IconSubmit } from '@/components/admin/icon-submit';
import { Eye, Pencil, Plus, Store } from 'lucide-react';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { TierShield } from '@/components/shop/tier-shield';
import { cn } from '@/lib/utils';
import { updateOdooCustomerAction } from '../customer-actions';
import { createDealerAction, createDealerUserAction, openAsDealerAction, pullOdooCreditLimitAction, resetPasswordAction, toggleUserActiveAction, updateDealerAction } from '../dealer-actions';

const TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];
const TIERS = Object.keys(DEALER_TIER_LABELS) as DealerTier[];
const STATUS = { PENDING: 'รออนุมัติ', ACTIVE: 'ใช้งาน', SUSPENDED: 'ระงับ' } as const;
type Status = keyof typeof STATUS;
const STATUS_CLASS: Record<Status, string> = { ACTIVE: 'bg-emerald-500/15 text-emerald-700', SUSPENDED: 'bg-destructive/15 text-destructive', PENDING: 'bg-amber-500/15 text-amber-700' };
const DEALER_ROLES = [{ value: 'DEALER_OWNER', label: 'เจ้าของร้าน' }, { value: 'DEALER_STAFF', label: 'พนักงานร้าน' }];
/** Status filter value for Odoo customers that have no web dealer yet. */
const ODOO_ONLY = 'ODOO';
const field = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm';

type Search = { q?: string; status?: string; pricelist?: string; page?: string; open?: string; saved?: string; error?: string; fromLead?: string; new?: string; partner?: string };
type Row = { kind: 'dealer'; d: DealerRow } | { kind: 'odoo'; c: OdooCustomer };
type OdooData = { customers: OdooCustomer[]; pricelists: OdooPricelistOption[]; carriers: DeliveryCarrier[]; defaultCarrier?: DeliveryCarrier };

/** Loads the Odoo side (customers, pricelists, delivery methods) live; null with the reason when Odoo is unreachable. */
async function loadOdoo(): Promise<{ data: OdooData; error?: undefined } | { data: null; error: string }> {
  try {
    const [customers, pricelists, allCarriers] = await Promise.all([listOdooCustomers(), listOdooPricelists(), listAllCarriers()]);
    const carriers = allCarriers.filter((c) => c.active);
    return { data: { customers, pricelists, carriers, defaultCarrier: carriers.find((c) => c.published) } };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ' };
  }
}

/**
 * Dealers and Odoo customers in one list: web dealers (approve, type/tier/zone, logins, impersonate) carry their
 * Odoo pricelist / credit limit / delivery method inline; Odoo customers without a web account are listed too and
 * can be priced the same way or turned into a web dealer.
 */
export default async function DealersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [actor, params] = await Promise.all([requireBackoffice(), searchParams]);
  const canEdit = isAdminRole(actor.role as Role);
  const writable = odooWritesEnabled();
  const odooOnlyView = params.status === ODOO_ONLY;
  const status = (['PENDING', 'ACTIVE', 'SUSPENDED'] as Status[]).includes(params.status as Status) ? (params.status as Status) : undefined;
  const [allDealers, settings, partners, openCredit, odoo] = await Promise.all([
    listDealers(), admin.getAdminSnapshot(), getPartners().catch(() => []), listOpenCreditOrders(), loadOdoo(),
  ]);
  const counts = { PENDING: 0, ACTIVE: 0, SUSPENDED: 0 } as Record<Status, number>;
  for (const d of allDealers) counts[d.status as Status] += 1;
  const partnerName = (id: number | null) => partners.find((p) => p.id === id)?.name;
  // Salesperson lives on the Odoo customer (res.partner.user_id); web orders carry it so commission stays with the right person.
  const salesperson = (id: number) => { const p = partners.find((x) => x.id === id); return p?.user_id ? p.user_id[1] : null; };
  const { zones, groups } = settings;
  const creditUsed = (d: DealerRow) => webCreditUsed({ id: d.id, odooPartnerId: d.odooPartnerId, creditOpening: Number(d.creditOpening) || 0 }, openCredit);

  const customerById = new Map((odoo.data?.customers ?? []).map((c) => [c.id, c]));
  const linked = new Set(allDealers.map((d) => d.odooPartnerId).filter((id): id is number => id !== null));
  // Linked partners that are not company customers: find out whether they are contacts, archived or gone.
  const otherKinds = odoo.data
    ? await getOdooPartnerKinds([...linked].filter((id) => !customerById.has(id))).catch(() => new Map<number, OdooPartnerKind>())
    : new Map<number, OdooPartnerKind>();
  const kindOf = (partnerId: number | null): OdooPartnerKind | null =>
    partnerId === null || !odoo.data ? null : customerById.has(partnerId) ? { kind: 'customer' } : otherKinds.get(partnerId) ?? null;
  const unlinked = (odoo.data?.customers ?? []).filter((c) => !linked.has(c.id));
  const matchesPricelist = (pricelist: OdooCustomer['pricelist'] | undefined) =>
    !params.pricelist || (params.pricelist === 'none' ? !pricelist : String(pricelist?.id) === params.pricelist);
  const q = searchText(params.q);
  const dealers = odooOnlyView ? [] : allDealers.filter((d) => (!status || d.status === status)
    && matchesSearch(q, d.name, d.province, d.phone, d.taxId, d.lineId, d.odooPartnerId ? customerById.get(d.odooPartnerId)?.name : null)
    && matchesPricelist(d.odooPartnerId ? customerById.get(d.odooPartnerId)?.pricelist : null));
  const odooRows = status ? [] : unlinked.filter((c) => matchesPricelist(c.pricelist) && matchesSearch(q, c.name, c.vat, c.phone, c.email, c.province));
  // Web dealers first, then Odoo customers without a web account, paged together.
  const rows: Row[] = [...dealers.map((d) => ({ kind: 'dealer' as const, d })), ...odooRows.map((c) => ({ kind: 'odoo' as const, c }))];
  const pageRows = paginate(rows, params.page);
  const pricelistCounts = new Map<number, number>();
  for (const c of odoo.data?.customers ?? []) if (c.pricelist) pricelistCounts.set(c.pricelist.id, (pricelistCounts.get(c.pricelist.id) ?? 0) + 1);

  const prefillCustomer = params.partner ? customerById.get(Number(params.partner)) : undefined;
  const prefill = prefillCustomer && !linked.has(prefillCustomer.id) ? prefillFrom(prefillCustomer) : undefined;
  /** List URL with the current filters; `changes` overrides params such as `status`, `open` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) =>
    listHref('/admin/dealers', { q: params.q, status: params.status, pricelist: params.pricelist, page: params.page }, changes);
  const filterHref = (next: string | undefined) => href({ status: next, page: undefined });
  const closeHref = href();
  const openDealer = params.open ? allDealers.find((d) => d.id === params.open) : undefined;
  const openCustomer = odoo.data && params.open?.startsWith('odoo-') ? customerById.get(Number(params.open.slice(5))) : undefined;
  /** Shops the "add dealer" name field suggests: every web dealer, then Odoo customers that have no web dealer yet. */
  const existingShops: ExistingShop[] = [
    ...allDealers.map((d) => ({ kind: 'dealer' as const, name: d.name, detail: [d.province, d.taxId && formatTaxId(d.taxId)].filter(Boolean).join(' · '), href: href({ open: d.id, new: undefined, partner: undefined }) })),
    ...unlinked.map((c) => ({ kind: 'odoo' as const, name: c.name, detail: [c.province, c.vat && formatTaxId(c.vat)].filter(Boolean).join(' · '), href: href({ new: '1', partner: String(c.id) }) })),
  ];
  /** Table row for an Odoo customer that has no web dealer yet. */
  const odooRow = (c: OdooCustomer) => {
    const editHref = href({ open: `odoo-${c.id}` });
    return (
      <TableRow key={`odoo-${c.id}`} data-state={params.open === `odoo-${c.id}` ? 'selected' : undefined} className="bg-muted/20">
        <TableCell data-label="ร้าน / ลูกค้า" className="min-w-56 whitespace-normal">
          <Link href={editHref} scroll={false} className="flex items-center gap-2 hover:underline">
            <DealerAvatar name={c.name} avatarFile={null} size={28} />
            <span className="min-w-0">
              <span className="block font-medium">{c.name}</span>
              <span className="block text-xs text-muted-foreground">{c.province ?? 'ไม่ระบุจังหวัด'} · Odoo #{c.id}</span>
            </span>
          </Link>
        </TableCell>
        <TableCell data-label="สถานะ">
          <span className="flex flex-wrap gap-1">
            <OdooKindBadge kind={{ kind: 'customer' }} />
            <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">ยังไม่มีบัญชีเว็บ</Badge>
          </span>
        </TableCell>
        <TableCell data-label="ระดับ"><span className="text-xs text-muted-foreground">—</span></TableCell>
        <TableCell data-label="กลุ่มราคา Odoo"><PricelistBadge customer={c} /></TableCell>
        <TableCell data-label="เครดิต" className="whitespace-normal"><OdooCredit customer={c} /></TableCell>
        <TableCell data-label="เซลล์">{c.salesperson ? <span className="text-xs">{c.salesperson}</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
        <TableCell data-label="ผู้ใช้" className="text-right">0</TableCell>
        <TableCell data-label="">
          <span className="flex justify-end gap-1">
            <IconLink href={editHref} label={canEdit ? 'ตั้งค่า' : 'ดูรายละเอียด'}>{canEdit ? <Pencil /> : <Eye />}</IconLink>
          </span>
        </TableCell>
      </TableRow>
    );
  };

  const notice = (
    <>
      {params.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>}
      {params.saved && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">บันทึกแล้ว</p>}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ดีลเลอร์ / ลูกค้า Odoo</h1>
          {canEdit && <div className="mt-1"><ExportMenu kind="dealers" label="ส่งออกดีลเลอร์" size="xs" /></div>}
          <p className="text-sm text-muted-foreground">อนุมัติร้าน กำหนดประเภท/ระดับ สร้างบัญชีเข้าสู่ระบบ และตั้งกลุ่มราคา (pricelist) วงเงินเครดิต การจัดส่งของลูกค้าใน Odoo ในที่เดียว · กดแถวเพื่อแก้ไข · โซนราคาคำนวณจากจังหวัด</p>
        </div>
        {canEdit && <Button nativeButton={false} render={<Link href={href({ new: '1' })} scroll={false} />} size="sm"><Plus /> เพิ่มดีลเลอร์</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['PENDING', 'ACTIVE', 'SUSPENDED'] as Status[]).map((s) => (
          <FilterChip key={s} href={filterHref(status === s ? undefined : s)} active={status === s}>{STATUS[s]} {counts[s]}</FilterChip>
        ))}
        {odoo.data && <FilterChip href={filterHref(odooOnlyView ? undefined : ODOO_ONLY)} active={odooOnlyView}>ลูกค้า Odoo ยังไม่มีบัญชีเว็บ {unlinked.length}</FilterChip>}
        <div className="w-full sm:ml-auto sm:w-auto">
          <ListSearch action="/admin/dealers" q={params.q} placeholder="ค้นชื่อร้าน / จังหวัด / โทร / เลขภาษี" keep={{ status: params.status }}
            clearHref={params.q || params.pricelist ? listHref('/admin/dealers', { status: params.status }) : undefined}>
            {odoo.data && (
              <select name="pricelist" defaultValue={params.pricelist ?? ''} aria-label="กลุ่มราคา" className={cn(field, 'w-auto')}>
                <option value="">ทุกกลุ่มราคา</option>
                {odoo.data.pricelists.map((p) => <option key={p.id} value={p.id}>{p.name} ({pricelistCounts.get(p.id) ?? 0})</option>)}
                <option value="none">ยังไม่ตั้งกลุ่มราคา</option>
              </select>
            )}
          </ListSearch>
        </div>
      </div>
      {odoo.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">เชื่อมต่อ Odoo ไม่ได้ จึงแสดงเฉพาะดีลเลอร์บนเว็บ (ตั้งกลุ่มราคา/วงเงิน Odoo ไม่ได้ชั่วคราว): {odoo.error}</p>}
      {odoo.data && !writable && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800">Odoo ตั้งเป็นอ่านอย่างเดียว (<code>ODOO_READ_ONLY</code>) ดูกลุ่มราคา/วงเงิน Odoo ได้แต่ยังบันทึกไม่ได้ · ตั้ง <code>ODOO_READ_ONLY=false</code> เพื่อเปิดการบันทึก</p>
      )}
      {params.error && !params.open && !params.new && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>}
      {params.fromLead && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">อนุมัติใบสมัครแล้ว ขั้นต่อไป: สร้างบัญชีเข้าสู่ระบบให้ร้าน (ในหน้าต่างแก้ไข) แล้วส่งรหัสทาง LINE</p>}

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>ร้าน / ลูกค้า</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>ระดับ</TableHead>
              <TableHead>กลุ่มราคา Odoo</TableHead>
              <TableHead>เครดิต</TableHead>
              <TableHead>เซลล์</TableHead>
              <TableHead className="text-right">ผู้ใช้</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <EmptyRow colSpan={8}>ไม่พบดีลเลอร์หรือลูกค้าตามเงื่อนไข · ใบสมัครใหม่อยู่ที่เมนู “ใบสมัครดีลเลอร์”</EmptyRow>}
            {pageRows.items.map((row) => {
              if (row.kind === 'odoo') return odooRow(row.c);
              const d = row.d;
              const zone = admin.zoneForProvince(d.province, zones);
              const group = admin.groupForDealerIn(settings, d.id);
              const customer = d.odooPartnerId ? customerById.get(d.odooPartnerId) : undefined;
              const seller = d.odooPartnerId ? salesperson(d.odooPartnerId) : null;
              const editHref = href({ open: d.id });
              return (
                <TableRow key={d.id} data-state={params.open === d.id ? 'selected' : undefined}>
                  <TableCell data-label="ร้าน / ลูกค้า" className="min-w-56 whitespace-normal">
                    <Link href={editHref} scroll={false} className="flex items-center gap-2 hover:underline">
                      <DealerAvatar name={d.name} avatarFile={d.avatarFile} size={28} />
                      <span className="min-w-0">
                        <span className="block font-medium">{d.name}</span>
                        <span className="block text-xs text-muted-foreground">{d.province} · โซน {zone.name}{group ? ` · กลุ่ม ${group.name}` : ''}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell data-label="สถานะ">
                    <span className="flex flex-wrap gap-1">
                      <Badge variant="outline" className={cn('border-transparent', STATUS_CLASS[d.status as Status])}>{STATUS[d.status as Status]}</Badge>
                      {d.creditEnabled && <Badge variant="outline" className="border-transparent bg-sky-500/15 text-sky-700">เครดิต</Badge>}
                      {d.odooPartnerId ? <OdooKindBadge kind={kindOf(d.odooPartnerId)} /> : <Badge variant="outline" className="border-dashed text-muted-foreground">ยังไม่ผูก Odoo</Badge>}
                    </span>
                  </TableCell>
                  <TableCell data-label="ระดับ"><TierShield tier={d.tier as DealerTier} withLabel /></TableCell>
                  <TableCell data-label="กลุ่มราคา Odoo">{customer ? <PricelistBadge customer={customer} /> : <span className="text-xs text-muted-foreground">{d.odooPartnerId ? `Odoo #${d.odooPartnerId}` : 'ยังไม่ผูก Odoo'}</span>}</TableCell>
                  <TableCell data-label="เครดิต" className="whitespace-normal"><DealerCredit dealer={d} used={creditUsed(d)} customer={customer} /></TableCell>
                  <TableCell data-label="เซลล์">
                    {seller ? <span className="text-xs">{seller}</span>
                      : d.odooPartnerId ? <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700">ยังไม่ตั้งเซลล์</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell data-label="ผู้ใช้" className="text-right">{d.users.length}</TableCell>
                  <TableCell data-label="">
                    <span className="flex justify-end gap-1">
                      <IconLink href={editHref} label={canEdit ? 'แก้ไข' : 'ดูรายละเอียด'}>{canEdit ? <Pencil /> : <Eye />}</IconLink>
                      <form action={openAsDealerAction}><input type="hidden" name="dealerId" value={d.id} /><IconSubmit label="เปิดมุมมองดีลเลอร์"><Store /></IconSubmit></form>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: String(n) })} unit={`ราย (ดีลเลอร์ ${dealers.length}${odoo.data ? ` · ลูกค้า Odoo ยังไม่มีบัญชีเว็บ ${odooRows.length}` : ''})`} />

      {params.new && canEdit && (
        <UrlDrawer key={`new-${params.partner ?? ''}`} title={prefill ? `สร้างดีลเลอร์จากลูกค้า Odoo` : 'เพิ่มดีลเลอร์ใหม่'} description={prefill?.name} closeHref={closeHref}>
          {notice}
          <DealerForm action={createDealerAction} prefill={prefill} existing={existingShops} odooCreditLimit={prefillCustomer && prefill ? prefillCustomer.creditLimit : undefined} partners={partners} zones={zones} groups={groups} pricelists={odoo.data?.pricelists ?? []} />
        </UrlDrawer>
      )}

      {openDealer && (() => {
        const d = openDealer;
        const zone = admin.zoneForProvince(d.province, zones);
        const book = admin.findBookIn(settings, zone.id, d.tier as DealerTier);
        const group = admin.groupForDealerIn(settings, d.id);
        const customer = d.odooPartnerId ? customerById.get(d.odooPartnerId) : undefined;
        return (
          <UrlDrawer
            key={d.id}
            title={<span className="flex items-center gap-2"><DealerAvatar name={d.name} avatarFile={d.avatarFile} size={28} />{d.name}</span>}
            description={`${d.province} · โซน ${zone.name} · ${d.types.map((t) => DEALER_TYPE_LABELS[t as DealerType]).join(', ')}${d.odooPartnerId ? ` · Odoo: ${customer?.name ?? partnerName(d.odooPartnerId) ?? `#${d.odooPartnerId}`}` : ' · ยังไม่ผูก Odoo'}`}
            closeHref={closeHref}
          >
            {notice}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('border-transparent', STATUS_CLASS[d.status as Status])}>{STATUS[d.status as Status]}</Badge>
              <TierShield tier={d.tier as DealerTier} withLabel />
              {d.creditEnabled && <CreditUsage limit={d.creditLimit == null ? null : Number(d.creditLimit)} used={creditUsed(d)} />}
              <form action={openAsDealerAction} className="ml-auto"><input type="hidden" name="dealerId" value={d.id} /><Button type="submit" size="sm" variant="outline">เปิดมุมมองดีลเลอร์</Button></form>
            </div>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">ข้อมูลร้าน</h2>
              {canEdit ? <DealerForm action={updateDealerAction} dealer={d} creditUsed={creditUsed(d)} odooCreditLimit={customer ? customer.creditLimit : undefined} partners={partners} zones={zones} groups={groups} groupId={group?.id} pricelists={odoo.data?.pricelists ?? []} /> : <p className="text-xs text-muted-foreground">แก้ไขได้เฉพาะแอดมิน</p>}
              {canEdit && customer && !sameCreditLimit(d.creditLimit == null ? null : Number(d.creditLimit), customer.creditLimit) && (
                <form action={pullOdooCreditLimitAction} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800">
                  <input type="hidden" name="dealerId" value={d.id} />
                  <span>วงเงินเว็บไม่ตรงกับ Partner Limit ใน Odoo ({customer.creditLimit === null ? 'ไม่จำกัด' : baht(customer.creditLimit)}){writable ? ' · กดบันทึกด้านบนเพื่อส่งวงเงินเว็บไป Odoo หรือ' : ' · Odoo อ่านอย่างเดียว ส่งไปไม่ได้ ·'}</span>
                  <Button type="submit" size="sm" variant="outline">ดึงวงเงินจาก Odoo มาใช้</Button>
                </form>
              )}
              <p className="text-xs text-muted-foreground">ราคา: {typePricelistSummary(d, odoo.data?.pricelists ?? [])}{book?.status === 'PUBLISHED' ? `ตารางราคาเว็บ ${zone.name} / ${d.tier}` : 'pricelist ใน Odoo'}</p>
            </section>

            {d.odooPartnerId && (
              <section className="space-y-2 rounded-lg border border-border p-3">
                <h2 className="text-sm font-semibold">Odoo</h2>
                {customer && odoo.data
                  ? <OdooCustomerPanel customer={customer} odoo={odoo.data} canEdit={canEdit} writable={writable} dealerId={d.id} />
                  : <p className="text-xs text-muted-foreground">{odoo.data ? <OdooKindNote partnerId={d.odooPartnerId} kind={kindOf(d.odooPartnerId)} /> : 'เชื่อมต่อ Odoo ไม่ได้'}</p>}
              </section>
            )}

            <section className="rounded-lg border border-border">
              <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">บัญชีผู้ใช้</h2>
              {d.users.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">ยังไม่มีบัญชีผู้ใช้</p>}
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
            </section>
          </UrlDrawer>
        );
      })()}

      {openCustomer && odoo.data && (
        <UrlDrawer key={`odoo-${openCustomer.id}`} title={openCustomer.name} description={`ลูกค้า Odoo #${openCustomer.id} · ยังไม่มีบัญชีเว็บ${openCustomer.salesperson ? ` · เซลล์: ${openCustomer.salesperson}` : ''}`} closeHref={closeHref}>
          {notice}
          <div className="flex flex-wrap items-center gap-2">
            <PricelistBadge customer={openCustomer} />
            <OdooCredit customer={openCustomer} />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">ข้อมูลร้าน</h2>
            {canEdit ? (
              <>
                <p className="text-xs text-muted-foreground">ตั้งค่าได้เหมือนดีลเลอร์บนเว็บ · กดบันทึกแล้วระบบสร้างข้อมูลร้านบนเว็บผูกกับ Odoo #{openCustomer.id} ให้ (ยังไม่สร้างบัญชีเข้าสู่ระบบ)</p>
                <DealerForm action={createDealerAction} prefill={prefillFrom(openCustomer)} existing={existingShops} odooCreditLimit={openCustomer.creditLimit} partners={partners} zones={zones} groups={groups} pricelists={odoo.data.pricelists} />
              </>
            ) : <p className="text-xs text-muted-foreground">แก้ไขได้เฉพาะแอดมิน</p>}
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <h2 className="text-sm font-semibold">Odoo</h2>
            <OdooCustomerPanel customer={openCustomer} odoo={odoo.data} canEdit={canEdit} writable={writable} />
          </section>
          <p className="text-xs text-muted-foreground">เข้าใช้งานเองได้ผ่าน Odoo portal หรือหน้า /activate</p>
        </UrlDrawer>
      )}
    </div>
  );
}

const KIND_BADGE: Record<OdooPartnerKind['kind'], { label: string; className: string; title: string }> = {
  customer: { label: 'ลูกค้า Odoo', className: 'bg-violet-500/15 text-violet-700', title: 'Customer ระดับบริษัทใน Odoo (customer_rank > 0) · ตั้งกลุ่มราคา/วงเงิน/การจัดส่งได้' },
  contact: { label: 'Contact Odoo', className: 'bg-amber-500/15 text-amber-800', title: 'Contact ใน Odoo ที่ยังไม่เป็น Customer หรือเป็นผู้ติดต่อใต้บริษัท' },
  archived: { label: 'Odoo ถูกเก็บถาวร', className: 'bg-destructive/15 text-destructive', title: 'Partner นี้ถูก Archive ใน Odoo' },
  missing: { label: 'ไม่พบใน Odoo', className: 'bg-destructive/15 text-destructive', title: 'ไม่พบ Partner id นี้ใน Odoo' },
};

/** Whether the linked Odoo partner is a company customer or only a contact (or archived / missing). Null = unknown (Odoo down). */
function OdooKindBadge({ kind }: { kind: OdooPartnerKind | null }) {
  if (!kind) return <Badge variant="outline" className="text-muted-foreground">Odoo</Badge>;
  const badge = KIND_BADGE[kind.kind];
  const title = kind.kind === 'contact' && kind.parent ? `${badge.title} · อยู่ใต้ ${kind.parent.name}` : badge.title;
  return <Badge variant="outline" className={cn('border-transparent', badge.className)} title={title}>{badge.label}</Badge>;
}

/** Drawer note for a linked partner that cannot be priced here, saying why and what to do. */
function OdooKindNote({ partnerId, kind }: { partnerId: number; kind: OdooPartnerKind | null }) {
  if (kind?.kind === 'contact') {
    return kind.parent
      ? <>Odoo #{partnerId} เป็นผู้ติดต่อของ {kind.parent.name} ให้ผูกกับบริษัทแทน</>
      : <>Odoo #{partnerId} ยังไม่เป็นลูกค้า (ยังไม่มีใบสั่งขาย)</>;
  }
  if (kind?.kind === 'archived') return <>Odoo #{partnerId} ถูกเก็บถาวร</>;
  return <>ไม่พบ Odoo #{partnerId}</>;
}

/** Odoo pricelist (price group) of the customer, or a warning badge when none is set. */
function PricelistBadge({ customer }: { customer: OdooCustomer }) {
  return customer.pricelist
    ? <Badge variant="outline">{customer.pricelist.name}</Badge>
    : <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700">ยังไม่ตั้งกลุ่มราคา</Badge>;
}

/** Odoo credit limit vs. receivable in a row header. */
function OdooCredit({ customer }: { customer: OdooCustomer }) {
  const over = customer.creditLimit !== null && customer.receivable > customer.creditLimit;
  return (
    <span className={cn('text-xs', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
      Odoo: {customer.creditLimit === null ? 'ไม่จำกัดวงเงิน' : `วงเงิน ${baht(customer.creditLimit)}`} · ค้างชำระ {baht(customer.receivable)}{over ? ' · เกินวงเงิน' : ''}
    </span>
  );
}

/** Odoo contact details plus the pricelist / delivery method form (written to res.partner); the credit limit lives in the dealer form. */
function OdooCustomerPanel({ customer: c, odoo, canEdit, writable, dealerId }: { customer: OdooCustomer; odoo: OdooData; canEdit: boolean; writable: boolean; dealerId?: string }) {
  const { pricelists, carriers, defaultCarrier } = odoo;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {[c.vat && `เลขภาษี ${c.vat}`, c.phone && `โทร ${c.phone}`, c.email].filter(Boolean).join(' · ') || 'ไม่มีข้อมูลติดต่อ'} · Odoo #{c.id}
        {' · '}จัดส่ง: {c.carrier?.name ?? `ค่าเริ่มต้น${defaultCarrier ? ` (${defaultCarrier.name})` : ''}`}
      </p>
      {canEdit ? (
        <form action={updateOdooCustomerAction} className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <input type="hidden" name="partnerId" value={c.id} />
          {dealerId && <input type="hidden" name="dealerId" value={dealerId} />}
          <label className="text-xs font-medium">กลุ่มราคา
            <select name="pricelistId" defaultValue={c.pricelist?.id ?? ''} required disabled={!writable} className={field}>
              <option value="" disabled>เลือกกลุ่มราคา</option>
              {pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {/* The limit is set once in the dealer form above (which writes it to Odoo); keep Odoo's value here. */}
          <input type="hidden" name="creditLimit" value={c.creditLimit ?? ''} />
          <label className="text-xs font-medium">การจัดส่ง
            <select name="carrierId" defaultValue={c.carrier?.id ?? ''} disabled={!writable} className={field}>
              <option value="">ค่าเริ่มต้น{defaultCarrier ? ` (${defaultCarrier.name})` : ''}</option>
              {c.carrier && !carriers.some((k) => k.id === c.carrier!.id) && <option value={c.carrier.id}>{c.carrier.name} (ปิดใช้งาน)</option>}
              {carriers.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={!writable}>บันทึกลง Odoo</Button></div>
        </form>
      ) : <p className="text-xs text-muted-foreground">แก้ไขได้เฉพาะแอดมิน</p>}
    </div>
  );
}

/** "ยางมอเตอร์ไซค์: Credit TBR · " prefix for families priced by their own pricelist, then "อื่น ๆ: " for the rest. */
function typePricelistSummary(dealer: DealerRow, pricelists: OdooPricelistOption[]): string {
  const entries = (Object.entries(dealer.typePricelists ?? {}) as [DealerType, number][]).filter(([t]) => dealer.types.includes(t));
  if (!entries.length) return '';
  const name = (id: number) => pricelists.find((p) => p.id === id)?.name ?? `#${id}`;
  return `${entries.map(([t, id]) => `${DEALER_TYPE_LABELS[t]}: ${name(id)}`).join(' · ')} · อื่น ๆ: `;
}

/** Odoo Partner Limit under the web limit field; saving a changed web limit writes it there. */
function OdooLimitNote({ web, odoo }: { web: number | null; odoo: number | null }) {
  const same = sameCreditLimit(web, odoo);
  return (
    <span className={cn('block font-normal', same ? 'text-muted-foreground' : 'text-amber-700')}>
      Odoo Partner Limit: {odoo === null ? 'ไม่จำกัด' : baht(odoo)}{same ? ' · ตรงกับเว็บ' : ' · ไม่ตรงกับเว็บ'}
    </span>
  );
}

/**
 * One credit cell for a web dealer: the credit limit (web, kept equal to the Odoo Partner Limit) with web usage,
 * then Odoo's unpaid invoices. Flags when Odoo holds a different limit.
 */
function DealerCredit({ dealer: d, used, customer }: { dealer: DealerRow; used: number; customer?: OdooCustomer }) {
  const limit = d.creditLimit == null ? null : Number(d.creditLimit);
  const over = customer && customer.creditLimit !== null && customer.receivable > customer.creditLimit;
  return (
    <span className="flex flex-col gap-0.5">
      {d.creditEnabled ? <CreditUsage limit={limit} used={used} /> : <span className="text-xs text-muted-foreground">เงินสด</span>}
      {customer && (
        <span className={cn('text-xs', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
          ค้างชำระ Odoo {baht(customer.receivable)}{over ? ' · เกินวงเงิน' : ''}
        </span>
      )}
      {customer && !sameCreditLimit(limit, customer.creditLimit) && (
        <span className="text-xs text-amber-700">Odoo วงเงิน {customer.creditLimit === null ? 'ไม่จำกัด' : baht(customer.creditLimit)} · ไม่ตรงกับเว็บ</span>
      )}
    </span>
  );
}

/** Web credit used vs. limit in the dealer row header. */
function CreditUsage({ limit, used }: { limit: number | null; used: number }) {
  if (limit === null) return <span className="text-xs text-muted-foreground">ค้างเครดิต {baht(used)} · ไม่จำกัดวงเงินเว็บ</span>;
  const left = Math.round((limit - used) * 100) / 100;
  return <span className={cn('text-xs', left < 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>วงเงิน {baht(limit)} · ใช้ {baht(used)} · {left < 0 ? `เกิน ${baht(-left)}` : `เหลือ ${baht(left)}`}</span>;
}

type Partner = Awaited<ReturnType<typeof getPartners>>[number];
type DealerRow = Awaited<ReturnType<typeof listDealers>>[number];
/** Starting values for a new dealer created from an Odoo customer. */
type DealerPrefill = { name: string; province: string; phone: string | null; taxId: string | null; odooPartnerId: number; creditLimit: number | null };

/** Dealer form values taken from an Odoo customer; its Partner Limit becomes the web limit so both start equal. */
function prefillFrom(c: OdooCustomer): DealerPrefill {
  return {
    name: c.name,
    province: (PROVINCES as readonly string[]).includes(c.province ?? '') ? c.province! : '',
    phone: c.phone,
    taxId: c.vat,
    odooPartnerId: c.id,
    creditLimit: c.creditLimit,
  };
}

/**
 * One Odoo pricelist per product family (e.g. motorcycle tyres at the big-dealer price, car tyres at the
 * small-dealer price). Blank = normal price. Only families ticked above are saved. When Odoo is down the
 * list is empty, so saved ids are kept as their own option and survive a save.
 */
/**
 * Pricelist and cash discount % per product family. A blank % uses the product's own cash discount,
 * then the % set on the pricelist (/admin/prices); 0 = no cash discount for that family. The % only applies to credit dealers paying cash.
 */
function TypePricelistFields({ saved, savedPercents, pricelists }: { saved: Partial<Record<DealerType, number>>; savedPercents: Partial<Record<DealerType, number>>; pricelists: OdooPricelistOption[] }) {
  return (
    <fieldset className="md:col-span-2">
      <legend className="text-xs font-medium">กลุ่มราคาตามประเภทสินค้า</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TYPES.map((t) => {
          const current = saved[t];
          const missing = current && !pricelists.some((p) => p.id === current);
          return (
            <div key={t} className="text-xs">
              <span>{DEALER_TYPE_LABELS[t]}</span>
              <div className="flex gap-1.5">
                <select name={`typePricelist_${t}`} aria-label={`กลุ่มราคา ${DEALER_TYPE_LABELS[t]}`} defaultValue={current ?? ''} className={cn(field, 'min-w-0 flex-1')}>
                  <option value="">ราคาปกติ</option>
                  {missing && <option value={current}>Pricelist #{current}</option>}
                  {pricelists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <label className="flex w-24 shrink-0 items-center gap-1">
                  <span className="sr-only">% ส่วนลดเงินสด {DEALER_TYPE_LABELS[t]}</span>
                  <input name={`typeCashPercent_${t}`} type="number" inputMode="decimal" min="0" max="50" step="0.01" defaultValue={savedPercents[t] ?? ''} placeholder="ตามสินค้า" title="% ส่วนลดเงินสด (ว่าง = ตามสินค้า/pricelist, 0 = ไม่ลด)" className={cn(field, 'text-right')} />
                  <span className="text-muted-foreground">%</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">ช่อง % = ส่วนลดเงินสดเมื่อลูกค้าเครดิตเลือกจ่ายสด ใช้ก่อนทุกค่า · ว่าง = ใช้ค่าที่ตั้งรายสินค้า (หน้าส่วนลดเงินสด) แล้วจึงใช้ % ของ pricelist · 0 = ไม่ให้ส่วนลดกลุ่มนี้</p>
    </fieldset>
  );
}

/**
 * Shared create/edit form. Province list is static so it works when Odoo is down.
 * `existing` (create only) feeds the shop-name autocomplete that points at shops we already have.
 */
function DealerForm({ action, dealer, prefill, existing, creditUsed, odooCreditLimit, partners, zones, groups, groupId, pricelists }: { action: (formData: FormData) => Promise<void>; dealer?: DealerRow; prefill?: DealerPrefill; existing?: ExistingShop[]; creditUsed?: number; odooCreditLimit?: number | null; partners: Partner[]; zones: PriceZone[]; groups: CustomerGroup[]; groupId?: string; pricelists: OdooPricelistOption[] }) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      {dealer && <input type="hidden" name="dealerId" value={dealer.id} />}
      <label className="text-xs font-medium">ชื่อร้าน
        {existing && !dealer
          ? <DealerNameField existing={prefill ? existing.filter((s) => !(s.kind === 'odoo' && s.name === prefill.name)) : existing} defaultValue={prefill?.name} className={field} />
          : <input name="name" defaultValue={dealer?.name ?? prefill?.name} required maxLength={120} className={field} />}
      </label>
      <label className="text-xs font-medium">จังหวัด
        <select name="province" defaultValue={dealer?.province ?? prefill?.province ?? ''} required className={field}>
          <option value="" disabled>เลือกจังหวัด</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}{zones.find((z) => z.provinces.includes(p)) ? ` · โซน ${zones.find((z) => z.provinces.includes(p))!.name}` : ''}</option>)}
        </select>
      </label>
      <fieldset className="md:col-span-2">
        <legend className="text-xs font-medium">ประเภทสินค้า</legend>
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          {TYPES.map((t) => <label key={t} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 has-[:checked]:border-primary has-[:checked]:bg-primary/10"><input type="checkbox" name="types" value={t} defaultChecked={dealer ? dealer.types.includes(t) : t === 'CAR'} />{DEALER_TYPE_LABELS[t]}</label>)}
        </div>
      </fieldset>
      <TypePricelistFields saved={dealer?.typePricelists ?? {}} savedPercents={dealer?.typeCashPercents ?? {}} pricelists={pricelists} />
      <label className="text-xs font-medium md:col-span-2">กลุ่มลูกค้า
        <select name="customerGroupId" defaultValue={groupId ?? ''} className={field}>
          <option value="">ไม่จัดกลุ่ม</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">ระดับ
        <select name="tier" defaultValue={dealer?.tier ?? 'M'} className={field}>{TIERS.map((t) => <option key={t} value={t}>{t} · {DEALER_TIER_LABELS[t]}</option>)}</select>
      </label>
      <label className="text-xs font-medium">สถานะ
        <select name="status" defaultValue={dealer?.status ?? 'ACTIVE'} className={field}>{(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}</select>
      </label>
      <label className="text-xs font-medium md:col-span-2">ลูกค้าใน Odoo
        <select name="odooPartnerId" defaultValue={dealer?.odooPartnerId ?? prefill?.odooPartnerId ?? ''} className={field}>
          <option value="">ไม่ผูก</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.state_id ? ` · ${p.state_id[1].replace(/\s*\(TH\)$/, '').replace(/^จังหวัด/, '')}` : ''}{p.property_product_pricelist ? ` · ${p.property_product_pricelist[1]}` : ''}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs md:col-span-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
        <input type="checkbox" name="creditEnabled" defaultChecked={dealer?.creditEnabled ?? false} />
        <span className="font-medium">ลูกค้าเครดิต</span>
      </label>
      <label className="text-xs font-medium">วงเงินเครดิต (บาท)
        <MoneyInput unstyled name="creditLimit" defaultValue={dealer ? dealer.creditLimit : prefill?.creditLimit} placeholder="ว่าง = ไม่จำกัด" className={field} />
        {odooCreditLimit !== undefined && <OdooLimitNote web={dealer ? (dealer.creditLimit == null ? null : Number(dealer.creditLimit)) : prefill?.creditLimit ?? null} odoo={odooCreditLimit} />}
      </label>
      <label className="text-xs font-medium">ยอดค้างยกมา (บาท)
        <MoneyInput unstyled name="creditOpening" defaultValue={dealer ? Number(dealer.creditOpening) || null : null} placeholder="0" className={field} />
        {creditUsed !== undefined && <span className="font-normal text-muted-foreground">ใช้ไป {baht(creditUsed)}</span>}
      </label>
      <label className="text-xs font-medium">โทร<input name="phone" defaultValue={dealer?.phone ?? prefill?.phone ?? ''} maxLength={30} className={field} /></label>
      <label className="text-xs font-medium">LINE ID<input name="lineId" defaultValue={dealer?.lineId ?? ''} maxLength={60} className={field} /></label>
      <label className="text-xs font-medium">เลขผู้เสียภาษี (13 หลัก ห้ามซ้ำกับร้านอื่น)<input name="taxId" inputMode="numeric" defaultValue={dealer?.taxId ?? prefill?.taxId ?? ''} maxLength={20} placeholder="0-1055-56123-45-6" className={field} /></label>
      <label className="text-xs font-medium">ที่อยู่<input name="address" defaultValue={dealer?.address ?? ''} maxLength={300} className={field} /></label>
      <label className="text-xs font-medium md:col-span-2">หมายเหตุ<input name="notes" defaultValue={dealer?.notes ?? ''} maxLength={500} className={field} /></label>
      <div className="md:col-span-2"><Button type="submit" size="sm">{dealer ? 'บันทึก' : 'สร้างดีลเลอร์'}</Button></div>
    </form>
  );
}
