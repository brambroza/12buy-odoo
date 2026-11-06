import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, Notice } from '@/components/admin/commission-header';
import { EmptyRow, IconLink, TableCard } from '@/components/admin/list-kit';
import { UrlDrawer } from '@/components/admin/url-drawer';
import { requirePermission } from '@/lib/auth/session';
import { commissionContext, ctxQuery } from '@/lib/commission/context';
import { payRuleText } from '@/lib/commission/period';
import { maskSecret } from '@/lib/odoo/connection';
import { decryptSecret } from '@/lib/settings/crypto';
import { Pencil, Plus } from 'lucide-react';
import { saveSourceAction } from '../actions';

const PATH = '/admin/commission/sources';
const label = 'block text-xs font-medium';
type Search = { source?: string; period?: string; open?: string; saved?: string; error?: string };

/** Masked API key, or a note when it cannot be decrypted with the current secret. */
function maskedKey(enc: string): string {
  try {
    return maskSecret(decryptSecret(enc));
  } catch {
    return 'ถอดรหัสไม่ได้ (กรอกใหม่)';
  }
}

/**
 * Companies whose commission is computed here, each with its own Odoo URL / database / user / API key
 * and period cut-off day. Commission is always calculated one company at a time.
 */
export default async function CommissionSourcesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('commission.manage');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const editing = params.open === 'new' ? null : ctx.sources.find((s) => s.id === params.open);
  const showDrawer = params.open === 'new' || Boolean(editing);
  const close = `${PATH}?${ctxQuery(ctx)}`;

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title="บริษัท / การเชื่อมต่อ Odoo" showPeriod={false}
        description="แต่ละบริษัทใช้ Odoo คนละฐานข้อมูลและ API key ของตัวเอง (อ่านอย่างเดียว) คิดค่าคอมทีละบริษัท"
        actions={<Button size="sm" nativeButton={false} render={<a href={`${PATH}?${ctxQuery(ctx, { open: 'new' })}`} />}><Plus /> เพิ่มบริษัท</Button>} />
      <Notice saved={params.saved} error={params.error} />

      <TableCard>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>บริษัท</TableHead>
              <TableHead>Odoo</TableHead>
              <TableHead>ผู้ใช้ / API key</TableHead>
              <TableHead>ตัดรอบ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ctx.sources.length === 0 && <EmptyRow colSpan={6}>ยังไม่มีบริษัท กด “เพิ่มบริษัท”</EmptyRow>}
            {ctx.sources.map((s) => (
              <TableRow key={s.id}>
                <TableCell data-label="บริษัท" className="font-medium">{s.name}</TableCell>
                <TableCell data-label="Odoo" className="text-xs break-all whitespace-normal">{s.url}<span className="block text-muted-foreground">db: {s.db}</span></TableCell>
                <TableCell data-label="ผู้ใช้" className="text-xs">{s.username}<span className="block font-mono text-muted-foreground">{maskedKey(s.apiKeyEnc)}</span></TableCell>
                <TableCell data-label="ตัดรอบ" className="text-xs">ทุกวันที่ {s.cutoffDay} · รอบ {s.cutoffDay + 1}–{s.cutoffDay}<span className="block text-muted-foreground">จ่าย{payRuleText(s.payDay, s.payMonths)}</span></TableCell>
                <TableCell data-label="สถานะ">{s.active ? <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">ใช้งาน</Badge> : <Badge variant="outline">ปิด</Badge>}</TableCell>
                <TableCell><IconLink href={`${PATH}?${ctxQuery(ctx, { open: s.id })}`} label={`แก้ไข ${s.name}`}><Pencil /></IconLink></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <p className="text-xs text-muted-foreground">ระบบจะทดสอบเข้าสู่ระบบ Odoo ก่อนบันทึกทุกครั้ง API key ถูกเข้ารหัสในฐานข้อมูล ใช้ผู้ใช้ Odoo ที่อ่านข้อมูลบัญชี (การรับชำระ ใบแจ้งหนี้) ได้</p>

      {showDrawer && (
        <UrlDrawer title={editing ? `แก้ไข ${editing.name}` : 'เพิ่มบริษัท'} closeHref={close}>
          <form action={saveSourceAction} className="grid max-w-xl gap-3">
            <input type="hidden" name="id" value={editing?.id ?? ''} />
            <input type="hidden" name="source" value={editing?.id ?? ctx.source?.id ?? ''} />
            <label className={label}>ชื่อบริษัท<Input name="name" required maxLength={120} defaultValue={editing?.name} className="mt-1" /></label>
            <label className={label}>Odoo URL<Input name="url" type="url" required placeholder="https://company.odoo.com" defaultValue={editing?.url} className="mt-1" /></label>
            <label className={label}>ฐานข้อมูล (db)<Input name="db" required defaultValue={editing?.db} className="mt-1" /></label>
            <label className={label}>ผู้ใช้ Odoo (อีเมล)<Input name="username" required defaultValue={editing?.username} className="mt-1" autoComplete="off" /></label>
            <label className={label}>API key{editing && <span className="font-normal text-muted-foreground"> (เว้นว่าง = ใช้ค่าเดิม {maskedKey(editing.apiKeyEnc)})</span>}
              <Input name="apiKey" type="password" required={!editing} autoComplete="new-password" className="mt-1" />
            </label>
            <p className="text-xs text-muted-foreground">วันตัดรอบและวันจ่าย ตั้งที่แท็บ “ตั้งค่ารอบ / การจ่าย”{editing ? '' : ' (บริษัทใหม่เริ่มที่ ตัดรอบวันที่ 20 จ่ายสิ้นเดือนถัดไป)'}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> ใช้งาน</label>
            <div><Button type="submit">ทดสอบและบันทึก</Button></div>
          </form>
        </UrlDrawer>
      )}
    </div>
  );
}

