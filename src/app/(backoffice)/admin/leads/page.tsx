import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { requireBackoffice } from '@/lib/auth/session';
import { isAdminRole, type Role } from '@/lib/auth/roles';
import { listLeads } from '@/lib/leads/repo';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, type DealerTier, type DealerType } from '@/lib/shop/types';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/lib/db/types';
import { approveLeadAction, setLeadStatusAction } from '../dealer-actions';
import Link from 'next/link';

const STATUS: Record<LeadStatus, string> = { NEW: 'ใหม่', CONTACTED: 'ติดต่อแล้ว', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่ผ่าน' };
const STATUS_CLASS: Record<LeadStatus, string> = { NEW: 'bg-amber-500/15 text-amber-700', CONTACTED: 'bg-blue-500/15 text-blue-700', APPROVED: 'bg-emerald-500/15 text-emerald-700', REJECTED: 'bg-muted text-muted-foreground' };
const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/** Inbox of public sign-ups: approve into a dealer in one click, or mark contacted / rejected. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [actor, { status }] = await Promise.all([requireBackoffice(), searchParams]);
  const canApprove = isAdminRole(actor.role as Role);
  const filter = (Object.keys(STATUS) as LeadStatus[]).includes(status as LeadStatus) ? (status as LeadStatus) : undefined;
  const [leads, all] = await Promise.all([listLeads(filter), listLeads()]);
  const counts = Object.fromEntries((Object.keys(STATUS) as LeadStatus[]).map((s) => [s, all.filter((l) => l.status === s).length])) as Record<LeadStatus, number>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ใบสมัครดีลเลอร์</h1>
        <p className="text-sm text-muted-foreground">จากฟอร์มสมัครบนหน้าเว็บ · อนุมัติ = สร้างร้านในระบบทันที แล้วไปสร้างบัญชีเข้าสู่ระบบให้ร้าน</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS) as LeadStatus[]).map((s) => (
          <Link key={s} href={`/admin/leads${filter === s ? '' : `?status=${s}`}`} className={cn('rounded-full border px-3 py-1 text-xs font-medium', filter === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{STATUS[s]} {counts[s]}</Link>
        ))}
      </div>
      {leads.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ไม่มีใบสมัคร{filter ? `สถานะ${STATUS[filter]}` : ''}</p>}
      <ul className="space-y-2">
        {leads.map((lead) => (
          <li key={lead.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{lead.shopName}</span>
              <Badge variant="outline" className={cn('border-transparent', STATUS_CLASS[lead.status])}>{STATUS[lead.status]}</Badge>
              <span className="text-xs text-muted-foreground">{lead.province} · {lead.types.map((t) => DEALER_TYPE_LABELS[t as DealerType]).join(', ')} · {fmt.format(lead.createdAt)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">โทร <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="underline">{lead.phone}</a>{lead.lineId && <> · LINE {lead.lineId}</>}{lead.note && <> · หมายเหตุ: {lead.note}</>}</p>
            {lead.dealer && <p className="mt-1 text-xs"><Link href={`/admin/dealers?open=${lead.dealer.id}`} className="text-primary underline">เปิดร้าน {lead.dealer.name}</Link></p>}
            {lead.status !== 'APPROVED' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canApprove && (
                  <form action={approveLeadAction} className="flex items-center gap-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select name="tier" defaultValue="M" aria-label="ระดับดีลเลอร์" className="h-8 rounded-lg border border-border bg-background px-2 text-xs">
                      {(Object.keys(DEALER_TIER_LABELS) as DealerTier[]).map((t) => <option key={t} value={t}>{t} · {DEALER_TIER_LABELS[t]}</option>)}
                    </select>
                    <Button type="submit" size="sm">อนุมัติและสร้างร้าน</Button>
                  </form>
                )}
                {lead.status !== 'CONTACTED' && (
                  <form action={setLeadStatusAction}><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="status" value="CONTACTED" /><Button type="submit" size="sm" variant="outline">ติดต่อแล้ว</Button></form>
                )}
                {lead.status !== 'REJECTED' && (
                  <form action={setLeadStatusAction} className="flex items-center gap-1"><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="status" value="REJECTED" /><Input name="note" placeholder="เหตุผล (ถ้ามี)" className="h-8 w-40 text-xs" /><Button type="submit" size="sm" variant="ghost">ไม่ผ่าน</Button></form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
