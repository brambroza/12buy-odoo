import Link from 'next/link';
import { Plus, UserCheck, UserX, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreateUserForm, ResetPasswordButton } from '@/components/admin/credential-forms';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { requireAdmin } from '@/lib/auth/session';
import { ROLE_LABELS, canManageRole, type Role } from '@/lib/auth/roles';
import { listPendingResetRequests } from '@/lib/auth/reset-requests';
import { listStaffUsers } from '@/lib/auth/users';
import { cn } from '@/lib/utils';
import { createStaffUserAction, dismissResetRequestAction, resetPasswordAction, toggleUserActiveAction } from '../dealer-actions';

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const PATH = '/admin/users';

type Search = { q?: string; page?: string; new?: string };

/** Back-office accounts. Dealer logins are managed from the dealer page instead. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [actor, params] = await Promise.all([requireAdmin(), searchParams]);
  const actorRole = actor.role as Role;
  const [users, allRequests] = await Promise.all([listStaffUsers(), listPendingResetRequests()]);
  const resetRequests = allRequests.filter((r) => canManageRole(actorRole, r.user.role as Role));
  const roles = (['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE'] as Role[]).filter((r) => canManageRole(actorRole, r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  // Put SUPER_ADMIN last so the default choice in the create form is the least privileged one available.
  const createRoles = roles.filter((r) => r.value !== 'SUPER_ADMIN').concat(roles.filter((r) => r.value === 'SUPER_ADMIN'));

  const q = searchText(params.q);
  const filtered = users.filter((u) => matchesSearch(q, u.name, u.email, ROLE_LABELS[u.role as Role]));
  const pageRows = paginate(filtered, params.page);
  /** List URL with the current search/page; `changes` overrides params such as `new` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) => listHref(PATH, { q: params.q, page: params.page }, changes);
  const closeHref = href();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ผู้ใช้งานระบบ</h1>
          <p className="text-sm text-muted-foreground">บัญชีทีมงาน (แอดมิน / ฝ่ายขาย / คลัง) · บัญชีของร้านดีลเลอร์จัดการที่หน้า “ดีลเลอร์”</p>
        </div>
        {createRoles.length > 0 && <Button size="sm" nativeButton={false} render={<Link href={href({ new: '1' })} scroll={false} />}><Plus /> เพิ่มผู้ใช้ทีมงาน</Button>}
      </div>

      {resetRequests.length > 0 && (
        <section aria-labelledby="reset-requests-heading" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <div>
            <p id="reset-requests-heading" className="font-semibold">คำขอรีเซ็ตรหัสผ่าน ({resetRequests.length})</p>
            <p className="text-xs text-muted-foreground">ยืนยันตัวตนผู้ขอก่อน แล้วกด “รีเซ็ตรหัส” ส่งรหัสชั่วคราวให้ทาง LINE คำขอจะปิดให้อัตโนมัติ</p>
          </div>
          <div className="rt overflow-hidden rounded-lg border border-amber-200 bg-card dark:border-amber-500/30">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>ผู้ขอ</TableHead>
                  <TableHead>ติดต่อ</TableHead>
                  <TableHead>ขอเมื่อ</TableHead>
                  <TableHead><span className="sr-only">จัดการ</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resetRequests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell data-label="ผู้ขอ">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{r.user.name}</span>
                        <Badge variant="outline">{ROLE_LABELS[r.user.role as Role]}</Badge>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.user.email}{r.user.dealer && ` · ${r.user.dealer.name}`}
                      </span>
                    </TableCell>
                    <TableCell data-label="ติดต่อ" className="text-xs">{r.contact || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell data-label="ขอเมื่อ" className="text-xs text-muted-foreground">{fmt.format(r.createdAt)}</TableCell>
                    <TableCell data-label="">
                      <span className="flex justify-end gap-1">
                        <ResetPasswordButton action={resetPasswordAction} userId={r.userId} compact />
                        <form action={dismissResetRequestAction}>
                          <input type="hidden" name="back" value={closeHref} />
                          <input type="hidden" name="requestId" value={r.id} />
                          <IconSubmit label="ปิดคำขอ"><X /></IconSubmit>
                        </form>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ListSearch action={PATH} q={params.q} placeholder="ค้นชื่อ / อีเมล / บทบาท" clearHref={params.q ? PATH : undefined} />
      </div>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>ผู้ใช้</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead>เข้าล่าสุด</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.items.length === 0 && <EmptyRow colSpan={4}>{q ? 'ไม่พบผู้ใช้ตามคำค้น' : 'ยังไม่มีผู้ใช้ทีมงาน'}</EmptyRow>}
            {pageRows.items.map((u) => {
              const self = u.id === actor.id;
              const manageable = !self && canManageRole(actorRole, u.role as Role);
              return (
                <TableRow key={u.id}>
                  <TableCell data-label="ผู้ใช้">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={cn('font-medium', !u.isActive && 'line-through text-muted-foreground')}>{u.name}</span>
                      {self && <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">คุณ</Badge>}
                      {!u.isActive && <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">ปิดใช้งาน</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {u.email}{u.mustChangePassword && ' · รอตั้งรหัสใหม่'}
                    </span>
                  </TableCell>
                  <TableCell data-label="บทบาท"><Badge variant="outline">{ROLE_LABELS[u.role as Role]}</Badge></TableCell>
                  <TableCell data-label="เข้าล่าสุด" className="text-xs text-muted-foreground">{u.lastLoginAt ? fmt.format(u.lastLoginAt) : '—'}</TableCell>
                  <TableCell data-label="">
                    {manageable && (
                      <span className="flex justify-end gap-1">
                        <ResetPasswordButton action={resetPasswordAction} userId={u.id} compact />
                        <form action={toggleUserActiveAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="back" value={closeHref} />
                          {u.isActive
                            ? <IconSubmit label="ปิดใช้งาน" tone="danger" confirm={`ปิดใช้งาน ${u.name}? ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์`}><UserX /></IconSubmit>
                            : <IconSubmit label="เปิดใช้งาน"><UserCheck /></IconSubmit>}
                        </form>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ListPagination page={pageRows} href={(n) => href({ page: String(n) })} unit="บัญชี" />

      {params.new && createRoles.length > 0 && (
        <UrlDrawer key="new-user" title="เพิ่มผู้ใช้ทีมงาน" description="ระบบสร้างรหัสผ่านชั่วคราวให้ แสดงครั้งเดียว ส่งให้ผู้ใช้ทาง LINE" closeHref={closeHref}>
          <CreateUserForm action={createStaffUserAction} hidden={{}} roles={createRoles} />
        </UrlDrawer>
      )}
    </div>
  );
}
