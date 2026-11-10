import { RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PendingSubmit } from '@/components/admin/pending-submit';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext } from '@/lib/commission/context';
import { isTagRep } from '@/lib/commission/ledger';
import { listReps, listStaffUsers } from '@/lib/commission/repo';
import { syncRepsAction, updateRepAction } from '../actions';

const PATH = '/admin/commission/reps';
type Search = { source?: string; period?: string; q?: string; page?: string; saved?: string; error?: string };

/** Reps of the company (customer tags "Sale …", plus Odoo users as fallback), optionally linked to a web login to see their own commission. */
export default async function CommissionRepsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const [reps, users] = ctx.source ? await Promise.all([listReps(ctx.source.id), listStaffUsers()]) : [[], []];
  const q = searchText(params.q);
  // Tag reps first (the real salespeople), then Odoo-user fallbacks; switched-off ones last.
  const sorted = [...reps].sort((a, b) => Number(b.active) - Number(a.active) || Number(isTagRep(b.odooUserId)) - Number(isTagRep(a.odooUserId)) || a.name.localeCompare(b.name));
  const filtered = sorted.filter((r) => matchesSearch(q, r.name));
  const page = paginate(filtered, params.page);
  const userName = new Map(users.map((u) => [u.id, `${u.name} (${u.email})`]));

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="พนักงานขาย" showPeriod={false}
        description="เซลล์ตัวจริงคือ tag “Sale …” บนลูกค้าใน Odoo (มีหลาย tag ใช้ tag แรก) · ลูกค้าที่ไม่มี tag ยอดเป็นของ Salesperson ในใบแจ้งหนี้ / ใบสั่งขาย / ลูกค้า (ถ้าชื่อตรงกับ tag เช่น user Tip = Sale Tip จะรวมเป็นคนเดียวกัน)"
        actions={ctx.source && (
          <form action={syncRepsAction}>
            <input type="hidden" name="source" value={ctx.source.id} />
            <input type="hidden" name="period" value={ctx.period} />
            <PendingSubmit icon={<RefreshCw />} label="ดึงจาก Odoo" pendingLabel="กำลังดึงจาก Odoo…" hint="ดึงข้อมูลจาก Odoo อาจใช้เวลาหลายนาที กรุณาอย่าปิดหรือรีเฟรชหน้านี้" />
          </form>
        )} />
      <Notice saved={params.saved} error={params.error} />
      {!ctx.source ? <NoSource /> : (
        <>
          <ListSearch action={PATH} q={params.q} placeholder="ชื่อพนักงานขาย" keep={{ source: ctx.source.id, period: ctx.period }} />
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>พนักงานขาย</TableHead>
                  <TableHead>ผูกกับบัญชีเว็บ (ดูค่าคอมของตัวเอง)</TableHead>
                  <TableHead>คิดค่าคอม</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.length === 0 && <EmptyRow colSpan={4}>{reps.length ? 'ไม่พบ' : 'ยังไม่มีพนักงานขาย กด “ดึงจาก Odoo”'}</EmptyRow>}
                {page.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell data-label="พนักงานขาย" className="font-medium">{r.name}<span className="block text-xs font-normal text-muted-foreground">{isTagRep(r.odooUserId) ? `tag ลูกค้า “Sale ${r.name}”` : `Salesperson Odoo (ใช้เมื่อลูกค้าไม่มี tag) #${r.odooUserId}`}</span></TableCell>
                    <TableCell data-label="บัญชีเว็บ" colSpan={3}>
                      <form action={updateRepAction} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="source" value={ctx.source!.id} />
                        <input type="hidden" name="period" value={ctx.period} />
                        <input type="hidden" name="id" value={r.id} />
                        <select name="userId" defaultValue={r.userId ?? ''} aria-label={`บัญชีเว็บของ ${r.name}`} className="h-9 max-w-72 rounded-lg border border-border bg-background px-2 text-sm">
                          <option value="">— ไม่ผูก —</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{userName.get(u.id)}</option>)}
                        </select>
                        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={r.active} /> คิดค่าคอม</label>
                        <IconSubmit label={`บันทึก ${r.name}`}><Save /></IconSubmit>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <ListPagination page={page} href={(n) => listHref(PATH, { source: ctx.source!.id, period: ctx.period, q: params.q }, { page: n > 1 ? n : undefined })} unit="คน" />
          <p className="text-xs text-muted-foreground">พนักงานที่ปิด “คิดค่าคอม” ยังเห็นยอดในรายงาน แต่ไม่ได้ค่าคอม มีผลเมื่อกดคำนวณรอบใหม่</p>
        </>
      )}
    </div>
  );
}
