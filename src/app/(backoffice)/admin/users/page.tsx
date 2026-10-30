import Link from 'next/link';
import { Pencil, Plus, ShieldCheck, UserCheck, UserX, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreateUserForm, ResetPasswordButton } from '@/components/admin/credential-forms';
import { IconSubmit } from '@/components/admin/icon-submit';
import { EmptyRow, FilterChip, IconLink, ListPagination, ListSearch, TableCard } from '@/components/admin/list-kit';
import { DealerAvatar } from '@/components/shop/dealer-avatar';
import { Input } from '@/components/ui/input';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { listHref, matchesSearch, paginate, searchText } from '@/lib/admin/list';
import { requireAdmin } from '@/lib/auth/session';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, assignableRoles, canManageRole, type Role } from '@/lib/auth/roles';
import { listPendingResetRequests } from '@/lib/auth/reset-requests';
import { listStaffUsers } from '@/lib/auth/users';
import { cn } from '@/lib/utils';
import { createStaffUserAction, dismissResetRequestAction, resetPasswordAction, toggleUserActiveAction, updateStaffUserAction } from '../dealer-actions';

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const PATH = '/admin/users';

type Search = { q?: string; page?: string; new?: string; edit?: string; role?: string; status?: string; error?: string };

const STATUS_FILTERS = { active: 'ใช้งานอยู่', inactive: 'ปิดใช้งาน' } as const;

/** Back-office accounts. Dealer logins are managed from the dealer page instead. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [actor, params] = await Promise.all([requireAdmin(), searchParams]);
  const actorRole = actor.role as Role;
  const [users, allRequests] = await Promise.all([listStaffUsers(), listPendingResetRequests()]);
  const resetRequests = allRequests.filter((r) => canManageRole(actorRole, r.user.role as Role));
  const roles = assignableRoles(actorRole).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  // Put SUPER_ADMIN last so the default choice in the create form is the least privileged one available.
  const createRoles = roles.filter((r) => r.value !== 'SUPER_ADMIN').concat(roles.filter((r) => r.value === 'SUPER_ADMIN'));

  const q = searchText(params.q);
  const roleFilter = STAFF_ROLES.includes(params.role as Role) ? (params.role as Role) : undefined;
  const statusFilter = params.status === 'active' || params.status === 'inactive' ? params.status : undefined;
  const filtered = users.filter((u) => matchesSearch(q, u.name, u.email, u.phone, ROLE_LABELS[u.role as Role])
    && (!roleFilter || u.role === roleFilter)
    && (!statusFilter || u.isActive === (statusFilter === 'active')));
  const pageRows = paginate(filtered, params.page);
  const keep = { q: params.q, role: roleFilter, status: statusFilter };
  /** List URL with the current search/filters/page; `changes` overrides params such as `edit` or `page`. */
  const href = (changes: Record<string, string | undefined> = {}) => listHref(PATH, { ...keep, page: params.page }, changes);
  const closeHref = href();
  const roleCount = (r: Role) => users.filter((u) => u.role === r).length;
  const editing = params.edit ? users.find((u) => u.id === params.edit && canManageRole(actorRole, u.role as Role)) : undefined;
  const editingSelf = editing?.id === actor.id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ผู้ใช้งานระบบ</h1>
          <p className="text-sm text-muted-foreground">บัญชีทีมงาน (แอดมิน / ฝ่ายขาย / คลัง) · บัญชีของร้านดีลเลอร์จัดการที่หน้า “ดีลเลอร์”</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/admin/users/roles" />}><ShieldCheck /> สิทธิ์ตามบทบาท</Button>
          {createRoles.length > 0 && <Button size="sm" nativeButton={false} render={<Link href={href({ new: '1' })} scroll={false} />}><Plus /> เพิ่มผู้ใช้ทีมงาน</Button>}
        </div>
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
        <ListSearch action={PATH} q={params.q} keep={{ role: roleFilter, status: statusFilter }} placeholder="ค้นชื่อ / อีเมล / เบอร์โทร" clearHref={params.q ? href({ q: undefined, page: undefined }) : undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip href={href({ role: undefined, page: undefined })} active={!roleFilter}>ทุกบทบาท ({users.length})</FilterChip>
        {STAFF_ROLES.map((r) => <FilterChip key={r} href={href({ role: r, page: undefined })} active={roleFilter === r}>{ROLE_LABELS[r]} ({roleCount(r)})</FilterChip>)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <FilterChip href={href({ status: undefined, page: undefined })} active={!statusFilter}>ทุกสถานะ</FilterChip>
        {(Object.keys(STATUS_FILTERS) as (keyof typeof STATUS_FILTERS)[]).map((k) => <FilterChip key={k} href={href({ status: k, page: undefined })} active={statusFilter === k}>{STATUS_FILTERS[k]}</FilterChip>)}
      </div>

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>ผู้ใช้</TableHead>
              <TableHead>เบอร์โทร</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>เข้าล่าสุด</TableHead>
              <TableHead><span className="sr-only">จัดการ</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.items.length === 0 && <EmptyRow colSpan={6}>{q || roleFilter || statusFilter ? 'ไม่พบผู้ใช้ตามเงื่อนไข' : 'ยังไม่มีผู้ใช้ทีมงาน'}</EmptyRow>}
            {pageRows.items.map((u) => {
              const self = u.id === actor.id;
              const editable = canManageRole(actorRole, u.role as Role);
              const manageable = !self && editable;
              return (
                <TableRow key={u.id}>
                  <TableCell data-label="ผู้ใช้">
                    <span className="flex items-center gap-2.5">
                      <DealerAvatar name={u.name} avatarFile={u.avatarFile ?? null} size={36} className={cn(!u.isActive && 'opacity-50 grayscale')} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={cn('font-medium', !u.isActive && 'line-through text-muted-foreground')}>{u.name}</span>
                          {self && <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">คุณ</Badge>}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {u.email}{u.mustChangePassword && ' · รอตั้งรหัสใหม่'}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell data-label="เบอร์โทร" className="text-xs tabular-nums">{u.phone ? <a href={`tel:${u.phone}`} className="hover:underline">{u.phone}</a> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell data-label="บทบาท"><Badge variant="outline">{ROLE_LABELS[u.role as Role]}</Badge></TableCell>
                  <TableCell data-label="สถานะ">
                    {u.isActive
                      ? <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">ใช้งานอยู่</Badge>
                      : <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">ปิดใช้งาน</Badge>}
                  </TableCell>
                  <TableCell data-label="เข้าล่าสุด" className="text-xs text-muted-foreground">{u.lastLoginAt ? fmt.format(u.lastLoginAt) : '—'}</TableCell>
                  <TableCell data-label="">
                    <span className="flex justify-end gap-1">
                      {self && <IconLink href="/admin/profile" label="แก้โปรไฟล์ของฉัน"><Pencil /></IconLink>}
                      {manageable && <IconLink href={href({ edit: u.id })} label="แก้ไขผู้ใช้และสิทธิ์"><Pencil /></IconLink>}
                      {manageable && (<>
                        <ResetPasswordButton action={resetPasswordAction} userId={u.id} compact />
                        <form action={toggleUserActiveAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="back" value={closeHref} />
                          {u.isActive
                            ? <IconSubmit label="ปิดใช้งาน" tone="danger" confirm={`ปิดใช้งาน ${u.name}? ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์`}><UserX /></IconSubmit>
                            : <IconSubmit label="เปิดใช้งาน"><UserCheck /></IconSubmit>}
                        </form>
                      </>)}
                    </span>
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

      {editing && !editingSelf && (
        <UrlDrawer key={`edit-${editing.id}`} title={`แก้ไขผู้ใช้ · ${editing.name}`} description={editing.email} closeHref={closeHref}>
          {params.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{params.error}</p>}
          <div className="flex items-center gap-3">
            <DealerAvatar name={editing.name} avatarFile={editing.avatarFile ?? null} size={56} />
            <div className="text-xs text-muted-foreground">
              <p>สร้างเมื่อ {fmt.format(editing.createdAt)}</p>
              <p>เข้าล่าสุด {editing.lastLoginAt ? fmt.format(editing.lastLoginAt) : '—'}</p>
              <p>รูปโปรไฟล์ผู้ใช้เปลี่ยนเองที่หน้า “โปรไฟล์ของฉัน”</p>
            </div>
          </div>
          <form action={updateStaffUserAction} className="space-y-4">
            <input type="hidden" name="userId" value={editing.id} />
            <input type="hidden" name="back" value={closeHref} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">ชื่อ
                <Input name="name" defaultValue={editing.name} required maxLength={80} className="mt-1" />
              </label>
              <label className="block text-sm font-medium">เบอร์โทร
                <Input name="phone" type="tel" inputMode="tel" defaultValue={editing.phone ?? ''} placeholder="08x-xxx-xxxx" maxLength={20} className="mt-1" />
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">บทบาท / สิทธิ์</legend>
              {assignableRoles(actorRole).map((r) => (
                <label key={r} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 text-sm has-checked:border-primary has-checked:bg-primary/5">
                  <input type="radio" name="role" value={r} defaultChecked={editing.role === r} className="mt-0.5 accent-primary" />
                  <span><span className="font-medium">{ROLE_LABELS[r]}</span><span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span></span>
                </label>
              ))}
              <Link href="/admin/users/roles" className="inline-block text-xs text-primary hover:underline">ดูตารางสิทธิ์ทุกบทบาท</Link>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">สถานะการใช้งาน</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-sm has-checked:border-emerald-500 has-checked:bg-emerald-500/5">
                  <input type="radio" name="isActive" value="1" defaultChecked={editing.isActive} className="accent-emerald-600" /> ใช้งานอยู่
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-sm has-checked:border-destructive has-checked:bg-destructive/5">
                  <input type="radio" name="isActive" value="0" defaultChecked={!editing.isActive} className="accent-red-600" /> ปิดใช้งาน
                </label>
              </div>
              <p className="text-xs text-muted-foreground">ปิดใช้งานแล้วผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์ทันที</p>
            </fieldset>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" size="sm">บันทึก</Button>
            </div>
          </form>
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-sm font-medium">รหัสผ่าน</p>
            <p className="text-xs text-muted-foreground">สร้างรหัสชั่วคราวใหม่ ผู้ใช้ต้องตั้งรหัสใหม่ตอนเข้าสู่ระบบ และถูกออกจากระบบทุกอุปกรณ์</p>
            <ResetPasswordButton action={resetPasswordAction} userId={editing.id} />
          </div>
        </UrlDrawer>
      )}
    </div>
  );
}
