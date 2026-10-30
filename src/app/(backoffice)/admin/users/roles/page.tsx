import Link from 'next/link';
import { ArrowLeft, Check, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableCard } from '@/components/admin/list-kit';
import { requireAdmin } from '@/lib/auth/session';
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, type Role } from '@/lib/auth/roles';
import { listStaffUsers } from '@/lib/auth/users';

/** Permission matrix: what each staff role can do, and how many active users hold it. */
export default async function RolesPage() {
  await requireAdmin();
  const users = await listStaffUsers();
  const count = (r: Role) => users.filter((u) => u.role === r && u.isActive).length;
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">สิทธิ์ตามบทบาท</h1>
          <p className="text-sm text-muted-foreground">สิทธิ์ผูกกับบทบาท เปลี่ยนสิทธิ์ของผู้ใช้โดยเปลี่ยนบทบาทที่หน้า “ผู้ใช้งานระบบ”</p>
        </div>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/admin/users" />}><ArrowLeft /> ผู้ใช้งานระบบ</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAFF_ROLES.map((r) => (
          <Link key={r} href={`/admin/users?role=${r}`} className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary">
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{ROLE_LABELS[r]}</span>
              <Badge variant="outline">{count(r)} คน</Badge>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
          </Link>
        ))}
      </div>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>สิทธิ์</TableHead>
              {STAFF_ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABELS[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.flatMap((group) => [
              <TableRow key={`g-${group}`} className="bg-muted/30 hover:bg-muted/30">
                <TableCell data-label="" colSpan={STAFF_ROLES.length + 1} className="text-xs font-semibold text-muted-foreground">{group}</TableCell>
              </TableRow>,
              ...PERMISSIONS.filter((p) => p.group === group).map((p) => (
                <TableRow key={p.label}>
                  <TableCell data-label="สิทธิ์" className="whitespace-normal">{p.label}</TableCell>
                  {STAFF_ROLES.map((r) => (
                    <TableCell key={r} data-label={ROLE_LABELS[r]} className="text-center">
                      {p.roles.includes(r)
                        ? <Check className="mx-auto size-4 text-emerald-600" aria-label="ได้" />
                        : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="ไม่ได้" />}
                    </TableCell>
                  ))}
                </TableRow>
              )),
            ])}
          </TableBody>
        </Table>
      </TableCard>
      <p className="text-xs text-muted-foreground">แอดมินจัดการผู้ใช้ได้ทุกบทบาทยกเว้นผู้ดูแลระบบสูงสุด · ไม่มีใครเปลี่ยนบทบาทหรือปิดใช้งานบัญชีของตัวเองได้</p>
    </div>
  );
}
