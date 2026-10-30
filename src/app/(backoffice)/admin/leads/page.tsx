import Link from 'next/link';
import { CheckCircle2, Eye, PhoneCall, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, FilterChip, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { IconSubmit } from '@/components/admin/icon-submit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { requireBackoffice } from '@/lib/auth/session';
import { isAdminRole, type Role } from '@/lib/auth/roles';
import { listLeads, type LeadWithDealer } from '@/lib/leads/repo';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, type DealerTier, type DealerType } from '@/lib/shop/types';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/lib/db/types';
import { formatThaiAddress, parseThaiAddress } from '@/lib/thai-address';
import { formatTaxId } from '@/lib/tax-id';
import { approveLeadAction, setLeadStatusAction } from '../dealer-actions';

const STATUS: Record<LeadStatus, string> = { NEW: 'ใหม่', CONTACTED: 'ติดต่อแล้ว', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่ผ่าน' };
const STATUS_CLASS: Record<LeadStatus, string> = { NEW: 'bg-amber-500/15 text-amber-700', CONTACTED: 'bg-blue-500/15 text-blue-700', APPROVED: 'bg-emerald-500/15 text-emerald-700', REJECTED: 'bg-muted text-muted-foreground' };
const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
/** Primary-styled icon link (approve opens the drawer where the tier is chosen). */
const PRIMARY_ICON = 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground';

type Search = { q?: string; status?: string; page?: string; open?: string };

/** Inbox of public sign-ups: table with quick "contacted"; approve (with tier) and reject (with reason) in a drawer. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [actor, params] = await Promise.all([requireBackoffice(), searchParams]);
  const canApprove = isAdminRole(actor.role as Role);
  const filter = (Object.keys(STATUS) as LeadStatus[]).includes(params.status as LeadStatus) ? (params.status as LeadStatus) : undefined;
  const all = await listLeads();
  const counts = Object.fromEntries((Object.keys(STATUS) as LeadStatus[]).map((s) => [s, all.filter((l) => l.status === s).length])) as Record<LeadStatus, number>;
  const q = searchText(params.q);
  const leads = all.filter((l) => (!filter || l.status === filter) && matchesSearch(q, l.shopName, l.province, l.phone, l.lineId, l.email, l.taxId));
  const pageRows = paginate(leads, params.page);

  /** List URL with the current filters; `changes` overrides params such as `status`, `open` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) =>
    listHref('/admin/leads', { q: params.q, status: filter, page: params.page }, changes);
  const closeHref = href();
  const openLead = params.open ? all.find((l) => l.id === params.open) : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ใบสมัครดีลเลอร์</h1>
        <p className="text-sm text-muted-foreground">จากฟอร์มสมัครบนหน้าเว็บ · อนุมัติ = สร้างร้านและบัญชีเจ้าของร้าน (อีเมล/รหัสผ่านที่ร้านตั้งตอนสมัคร) ทันที</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS) as LeadStatus[]).map((s) => (
          <FilterChip key={s} href={href({ status: filter === s ? undefined : s, page: undefined })} active={filter === s}>{STATUS[s]} {counts[s]}</FilterChip>
        ))}
        <div className="w-full sm:ml-auto sm:w-auto">
          <ListSearch action="/admin/leads" q={params.q} placeholder="ค้นชื่อร้าน / จังหวัด / โทร / LINE / อีเมล" keep={{ status: filter }}
            clearHref={params.q ? listHref('/admin/leads', { status: filter }) : undefined} />
        </div>
      </div>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>ร้าน</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>ติดต่อ</TableHead>
              <TableHead>สมัครเมื่อ</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 && <EmptyRow colSpan={5}>ไม่มีใบสมัคร{filter ? `สถานะ${STATUS[filter]}` : ''}{q ? 'ตามคำค้น' : ''}</EmptyRow>}
            {pageRows.items.map((lead) => {
              const openHref = href({ open: lead.id });
              return (
                <TableRow key={lead.id} data-state={params.open === lead.id ? 'selected' : undefined}>
                  <TableCell data-label="ร้าน">
                    <Link href={openHref} scroll={false} className="block hover:underline">
                      <span className="block font-medium">{lead.shopName}</span>
                      <span className="block text-xs text-muted-foreground">{lead.province} · {lead.types.map((t) => DEALER_TYPE_LABELS[t as DealerType]).join(', ')}</span>
                    </Link>
                  </TableCell>
                  <TableCell data-label="สถานะ"><Badge variant="outline" className={cn('border-transparent', STATUS_CLASS[lead.status])}>{STATUS[lead.status]}</Badge></TableCell>
                  <TableCell data-label="ติดต่อ">
                    <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="block text-xs underline">{lead.phone}</a>
                    {lead.lineId && <span className="block text-xs text-muted-foreground">LINE {lead.lineId}</span>}
                    {lead.taxId && <span className="block text-xs text-muted-foreground">ภาษี {formatTaxId(lead.taxId)}</span>}
                  </TableCell>
                  <TableCell data-label="สมัครเมื่อ"><span className="text-xs text-muted-foreground">{fmt.format(new Date(lead.createdAt))}</span></TableCell>
                  <TableCell data-label="">
                    <span className="flex justify-end gap-1">
                      {canApprove && lead.status !== 'APPROVED' && <IconLink href={openHref} label="อนุมัติและสร้างร้าน" className={PRIMARY_ICON}><CheckCircle2 /></IconLink>}
                      {lead.status !== 'APPROVED' && lead.status !== 'CONTACTED' && (
                        <form action={setLeadStatusAction}>
                          <input type="hidden" name="back" value={href({ open: undefined })} />
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="status" value="CONTACTED" />
                          <IconSubmit label="ติดต่อแล้ว"><PhoneCall /></IconSubmit>
                        </form>
                      )}
                      {lead.dealer && <IconLink href={`/admin/dealers?open=${lead.dealer.id}`} label={`เปิดร้าน ${lead.dealer.name}`}><Store /></IconLink>}
                      <IconLink href={openHref} label="ดูรายละเอียด"><Eye /></IconLink>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: String(n) })} unit="ใบสมัคร" />

      {openLead && <LeadDrawer key={openLead.id} lead={openLead} canApprove={canApprove} closeHref={closeHref} />}
    </div>
  );
}

/** Drawer with the full sign-up and the approve (tier) / contacted / reject (reason) forms. */
function LeadDrawer({ lead, canApprove, closeHref }: { lead: LeadWithDealer; canApprove: boolean; closeHref: string }) {
  const address = parseThaiAddress(lead.address);
  return (
    <UrlDrawer
      title={<span className="flex flex-wrap items-center gap-2">{lead.shopName}<Badge variant="outline" className={cn('border-transparent', STATUS_CLASS[lead.status])}>{STATUS[lead.status]}</Badge></span>}
      description={`${lead.province} · ${lead.types.map((t) => DEALER_TYPE_LABELS[t as DealerType]).join(', ')} · ${fmt.format(new Date(lead.createdAt))}`}
      closeHref={closeHref}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {lead.taxId && <><dt className="text-muted-foreground">เลขผู้เสียภาษี</dt><dd>{formatTaxId(lead.taxId)}</dd></>}
        <dt className="text-muted-foreground">โทร</dt>
        <dd><a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="underline">{lead.phone}</a></dd>
        {lead.lineId && <><dt className="text-muted-foreground">LINE</dt><dd>{lead.lineId}</dd></>}
        {lead.email && (
          <><dt className="text-muted-foreground">อีเมลเข้าสู่ระบบ</dt>
            <dd>{lead.email}{lead.passwordHash && <span className="block text-xs text-muted-foreground">ตั้งรหัสผ่านแล้ว อนุมัติแล้วร้านเข้าระบบได้ทันที</span>}</dd></>
        )}
        {address && <><dt className="text-muted-foreground">ที่อยู่</dt><dd>{formatThaiAddress(address)}</dd></>}
        {lead.note && <><dt className="text-muted-foreground">หมายเหตุ</dt><dd>{lead.note}</dd></>}
      </dl>
      {lead.dealer && <p className="text-sm"><Link href={`/admin/dealers?open=${lead.dealer.id}`} className="text-primary underline">เปิดร้าน {lead.dealer.name}</Link></p>}

      {lead.status !== 'APPROVED' && (
        <div className="space-y-3">
          {canApprove && (
            <section className="space-y-2 rounded-lg border border-border p-3">
              <h2 className="text-sm font-semibold">อนุมัติและสร้างร้าน</h2>
              <form action={approveLeadAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <select name="tier" defaultValue="M" aria-label="ระดับดีลเลอร์" className="h-8 rounded-lg border border-border bg-background px-2 text-xs">
                  {(Object.keys(DEALER_TIER_LABELS) as DealerTier[]).map((t) => <option key={t} value={t}>{t} · {DEALER_TIER_LABELS[t]}</option>)}
                </select>
                <Button type="submit" size="sm">อนุมัติและสร้างร้าน</Button>
              </form>
            </section>
          )}
          <section className="flex flex-wrap items-center gap-2">
            {lead.status !== 'CONTACTED' && (
              <form action={setLeadStatusAction}><input type="hidden" name="back" value={closeHref} /><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="status" value="CONTACTED" /><Button type="submit" size="sm" variant="outline">ติดต่อแล้ว</Button></form>
            )}
            {lead.status !== 'REJECTED' && (
              <form action={setLeadStatusAction} className="flex items-center gap-1">
                <input type="hidden" name="back" value={closeHref} />
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="status" value="REJECTED" />
                <Input name="note" placeholder="เหตุผล (ถ้ามี)" className="h-8 w-40 text-xs" />
                <IconSubmit label="ไม่ผ่าน" tone="danger" confirm={`ยืนยันว่า ${lead.shopName} ไม่ผ่าน?`} className="w-auto px-2.5">ไม่ผ่าน</IconSubmit>
              </form>
            )}
          </section>
        </div>
      )}
    </UrlDrawer>
  );
}
