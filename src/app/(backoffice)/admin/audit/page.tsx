import Link from 'next/link';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyRow, FilterChip, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, paginate } from '@/lib/admin/list';
import { auditFacets, listAuditLogs } from '@/lib/auth/audit-log';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

const PATH = '/admin/audit';
const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium' });

/** Human label for an action prefix. */
const ACTION_LABELS: Record<string, string> = {
  login: 'เข้าสู่ระบบ', order: 'ออเดอร์', pricebook: 'ตารางราคา', dealer: 'ดีลเลอร์', lead: 'ใบสมัคร', user: 'ผู้ใช้', settings: 'ตั้งค่า', coupon: 'คูปอง', carrier: 'การจัดส่ง',
  odoo: 'Odoo', export: 'ส่งออก', promotion: 'โปรโมชัน', 'password-reset': 'รีเซ็ตรหัสผ่าน', profile: 'โปรไฟล์', 'cash-discount': 'ส่วนลดเงินสด',
};
const TONE: Record<string, string> = { login: 'bg-muted text-muted-foreground', order: 'bg-sky-500/15 text-sky-700', pricebook: 'bg-amber-500/15 text-amber-800', settings: 'bg-violet-500/15 text-violet-700', user: 'bg-emerald-500/15 text-emerald-700' };

type Search = { q?: string; action?: string; entity?: string; from?: string; to?: string; page?: string; open?: string };

/** Who changed what, when: the AuditLog table with filters by kind, entity, date and free text; details in a drawer. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [, params] = await Promise.all([requirePermission('audit.view'), searchParams]);
  const rows = await listAuditLogs({ q: params.q, action: params.action, entity: params.entity, from: params.from, to: params.to });
  const facets = auditFacets(rows);
  const page = paginate(rows, params.page, 50);
  const href = (changes: Record<string, string | undefined>) => listHref(PATH, params, { page: undefined, ...changes });
  const open = params.open ? rows.find((r) => r.id === params.open) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><History className="size-6" /> ประวัติการแก้ไข</h1>
          <p className="text-sm text-muted-foreground">ทุกการกระทำสำคัญในหลังบ้านและการเข้าสู่ระบบ · เก็บย้อนหลัง 1 ปี · แสดงล่าสุด {rows.length} รายการตามตัวกรอง</p>
        </div>
        <ListSearch action={PATH} q={params.q} placeholder="ค้นหา action / entity / ชื่อผู้ใช้ / ข้อมูล" keep={{ action: params.action, entity: params.entity, from: params.from, to: params.to }} clearHref={params.q ? href({ q: undefined }) : undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip href={href({ action: undefined })} active={!params.action}>ทุกประเภท</FilterChip>
        {facets.actions.map((a) => <FilterChip key={a} href={href({ action: params.action === a ? undefined : a })} active={params.action === a}>{ACTION_LABELS[a] ?? a}</FilterChip>)}
        <form action={PATH} className="ml-auto flex items-center gap-1 text-xs">
          {params.action && <input type="hidden" name="action" value={params.action} />}
          {params.q && <input type="hidden" name="q" value={params.q} />}
          <Input name="from" type="date" defaultValue={params.from} aria-label="จากวันที่" className="h-8 w-36" />
          <span>–</span>
          <Input name="to" type="date" defaultValue={params.to} aria-label="ถึงวันที่" className="h-8 w-36" />
          <button type="submit" className="h-8 rounded-lg border border-border bg-card px-2 hover:bg-muted">กรอง</button>
        </form>
      </div>
      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>เวลา</TableHead>
              <TableHead>ผู้กระทำ</TableHead>
              <TableHead>การกระทำ</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead data-priority="low">รายละเอียด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && <EmptyRow colSpan={5}>ไม่พบรายการ</EmptyRow>}
            {page.items.map((r) => {
              const prefix = r.action.split('.')[0];
              return (
                <TableRow key={r.id} data-state={params.open === r.id ? 'selected' : undefined}>
                  <TableCell data-label="เวลา" className="whitespace-nowrap text-xs text-muted-foreground">{fmt.format(r.createdAt)}</TableCell>
                  <TableCell data-label="ผู้กระทำ">{r.user ? <span className="block"><span className="font-medium">{r.user.name}</span><span className="block text-xs text-muted-foreground">{r.user.email}</span></span> : <span className="text-xs text-muted-foreground">ระบบ / ไม่ระบุ</span>}</TableCell>
                  <TableCell data-label="การกระทำ"><Badge variant="outline" className={cn('border-transparent font-mono text-[11px]', TONE[prefix] ?? 'bg-muted')}>{r.action}</Badge></TableCell>
                  <TableCell data-label="รายการ" className="font-mono text-xs">{r.entity} <span className="text-muted-foreground">{r.entityId.slice(0, 24)}</span></TableCell>
                  <TableCell data-label="รายละเอียด" data-priority="low" className="max-w-md">
                    {r.diff ? <Link href={href({ open: r.id })} scroll={false} className="line-clamp-1 break-all text-xs text-primary underline">{JSON.stringify(r.diff).slice(0, 120)}</Link> : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={page} href={(n) => listHref(PATH, params, { page: String(n) })} unit="รายการ" />
      {open && (
        <UrlDrawer title={open.action} description={`${fmt.format(open.createdAt)} · ${open.user?.name ?? 'ระบบ'} · ${open.entity} ${open.entityId}`} closeHref={href({ open: undefined })}>
          <pre className="max-h-[70vh] overflow-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(open.diff, null, 2)}</pre>
        </UrlDrawer>
      )}
    </div>
  );
}
