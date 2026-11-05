import { RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext } from '@/lib/commission/context';
import { listReps, listStaffUsers } from '@/lib/commission/repo';
import { syncRepsAction, updateRepAction } from '../actions';

const PATH = '/admin/commission/reps';
type Search = { source?: string; period?: string; q?: string; page?: string; saved?: string; error?: string };

/** Odoo salespeople of the company, linked (optionally) to a web login so they can see their own commission. */
export default async function CommissionRepsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const [reps, users] = ctx.source ? await Promise.all([listReps(ctx.source.id), listStaffUsers()]) : [[], []];
  const q = searchText(params.q);
  const filtered = reps.filter((r) => matchesSearch(q, r.name, r.odooUserId));
  const page = paginate(filtered, params.page);
  const userName = new Map(users.map((u) => [u.id, `${u.name} (${u.email})`]));

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="พนักงานขาย" showPeriod={false}
        description="ดึงผู้ใช้ภายในจาก Odoo ของบริษัท ยอดเป็นของ Salesperson บนใบแจ้งหนี้ ถ้าว่างใช้ของใบสั่งขาย แล้วค่อยของลูกค้า"
        actions={ctx.source && (
          <form action={syncRepsAction}>
            <input type="hidden" name="source" value={ctx.source.id} />
            <input type="hidden" name="period" value={ctx.period} />
            <Button type="submit" size="sm" variant="outline"><RefreshCw /> ดึงจาก Odoo</Button>
          </form>
        )} />
      <Notice saved={params.saved} error={params.error} />
      {!ctx.source ? <NoSource /> : (
        <>
          <ListSearch action={PATH} q={params.q} placeholder="ชื่อ หรือ Odoo user id" keep={{ source: ctx.source.id, period: ctx.period }} />
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>พนักงานขาย (Odoo)</TableHead>
                  <TableHead>ผูกกับบัญชีเว็บ (ดูค่าคอมของตัวเอง)</TableHead>
                  <TableHead>คิดค่าคอม</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.length === 0 && <EmptyRow colSpan={4}>{reps.length ? 'ไม่พบ' : 'ยังไม่มีพนักงานขาย กด “ดึงจาก Odoo”'}</EmptyRow>}
                {page.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell data-label="พนักงานขาย" className="font-medium">{r.name}<span className="block text-xs font-normal text-muted-foreground">Odoo user #{r.odooUserId}</span></TableCell>
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
