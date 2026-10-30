import { AlertTriangle, CheckCircle2, Database, KeyRound, Link2, Plug, RotateCcw, Save, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconSubmit } from '@/components/admin/icon-submit';
import { requireAdmin } from '@/lib/auth/session';
import { findUserById } from '@/lib/auth/users';
import { daysUntil, listOdooApiKeys } from '@/lib/odoo/api-keys';
import { getOdooConnection, maskSecret } from '@/lib/odoo/connection';
import { odooWritesEnabled } from '@/lib/odoo/rpc';
import { hasDedicatedSecret } from '@/lib/settings/crypto';
import { cn } from '@/lib/utils';
import { clearOdooConnectionAction, saveOdooConnectionAction, testOdooConnectionAction } from '../settings-actions';

type Search = { error?: string; saved?: string };

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const fmtDate = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' });
const field = 'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-normal';
const label = 'block text-xs font-medium';
/** Warn this many days before an API key expires. */
const WARN_DAYS = 14;

/** `2026-11-30` or `2026-11-30 10:00:00` (Odoo) → Thai date. */
function thaiDate(value: string | null): string {
  if (!value) return '—';
  const at = new Date(value.includes(' ') ? `${value.replace(' ', 'T')}Z` : value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(at.getTime()) ? value : fmtDate.format(at);
}

/** Colour + text for how long an API key has left. */
function expiryBadge(expiresAt: string | null) {
  const days = daysUntil(expiresAt);
  if (days === null) return <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">ไม่ระบุวันหมดอายุ</Badge>;
  if (days < 0) return <Badge variant="outline" className="border-transparent bg-destructive/15 text-destructive">หมดอายุแล้ว {-days} วัน</Badge>;
  if (days <= WARN_DAYS) return <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-800">เหลือ {days} วัน</Badge>;
  return <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">เหลือ {days} วัน</Badge>;
}

/**
 * Odoo connection in use (URL, database, user, masked API key, expiry) with a form to change it from
 * the web. A new connection is tested against Odoo before it is saved; the saved one overrides the
 * `ODOO_*` env vars, and "ใช้ค่าจาก .env" removes it again.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [, params] = await Promise.all([requireAdmin(), searchParams]);
  const conn = await getOdooConnection();
  const configured = Boolean(conn.url && conn.db && conn.username && conn.apiKey);
  const [updatedBy, apiKeys] = await Promise.all([
    conn.updatedById ? findUserById(conn.updatedById) : null,
    configured ? listOdooApiKeys() : Promise.resolve({ ok: false as const, reason: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ' }),
  ]);
  const expiringKeys = apiKeys.ok ? apiKeys.keys.filter((k) => { const d = daysUntil(k.expiresAt); return d !== null && d <= WARN_DAYS; }) : [];
  const savedDays = daysUntil(conn.apiKeyExpiresAt);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ตั้งค่าเชื่อมต่อ Odoo</h1>
        <p className="text-sm text-muted-foreground">ค่าที่บันทึกจากหน้านี้ถูกเก็บในฐานข้อมูลของเว็บ (API key เข้ารหัส) และใช้แทนค่าใน .env ทันทีโดยไม่ต้อง deploy ใหม่</p>
      </div>
      {params.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{params.error}</p>}
      {conn.savedError && <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {conn.savedError}</p>}
      {savedDays !== null && savedDays <= WARN_DAYS && (
        <p className={cn('flex items-start gap-2 rounded-lg p-3 text-sm', savedDays < 0 ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-800')}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> API key ที่ใช้อยู่{savedDays < 0 ? 'หมดอายุแล้ว' : `จะหมดอายุใน ${savedDays} วัน`} ({thaiDate(conn.apiKeyExpiresAt)}) สร้าง key ใหม่ใน Odoo แล้วบันทึกด้านล่าง
        </p>
      )}
      {expiringKeys.length > 0 && savedDays === null && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> มี API key ของผู้ใช้นี้ใน Odoo ที่ใกล้หมดอายุหรือหมดอายุแล้ว {expiringKeys.length} รายการ ดูรายการด้านล่าง</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card">
          <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
            <span className="flex items-center gap-2"><Plug className="size-4" /> การเชื่อมต่อที่ใช้อยู่</span>
            <Badge variant="outline" className={cn('border-transparent', conn.source === 'db' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{conn.source === 'db' ? 'บันทึกจากหน้าเว็บ' : 'จาก .env'}</Badge>
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 p-4 text-sm">
            <dt className="flex items-center gap-1.5 text-muted-foreground"><Link2 className="size-3.5" /> URL</dt>
            <dd className="min-w-0 break-all">{conn.url ? <a href={conn.url} target="_blank" rel="noreferrer" className="underline">{conn.url}</a> : <span className="text-destructive">ยังไม่ได้ตั้ง</span>}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground"><Database className="size-3.5" /> ฐานข้อมูล</dt>
            <dd>{conn.db || <span className="text-destructive">ยังไม่ได้ตั้ง</span>}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground"><UserRound className="size-3.5" /> ผู้ใช้</dt>
            <dd className="break-all">{conn.username || <span className="text-destructive">ยังไม่ได้ตั้ง</span>}</dd>
            <dt className="flex items-center gap-1.5 text-muted-foreground"><KeyRound className="size-3.5" /> API key</dt>
            <dd className="font-mono text-xs">{conn.apiKey ? maskSecret(conn.apiKey) : <span className="font-sans text-sm text-destructive">ยังไม่ได้ตั้ง</span>}</dd>
            <dt className="text-muted-foreground">หมดอายุ</dt>
            <dd className="flex flex-wrap items-center gap-2">{thaiDate(conn.apiKeyExpiresAt)} {expiryBadge(conn.apiKeyExpiresAt)}</dd>
            <dt className="text-muted-foreground">โหมดเขียน</dt>
            <dd>{odooWritesEnabled() ? <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700">ส่งข้อมูลเข้า Odoo ได้ (ODOO_READ_ONLY=false)</Badge> : <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-800">อ่านอย่างเดียว (ODOO_READ_ONLY)</Badge>}</dd>
            {conn.updatedAt && (
              <>
                <dt className="text-muted-foreground">บันทึกล่าสุด</dt>
                <dd>{fmt.format(new Date(conn.updatedAt))}{updatedBy ? ` · ${updatedBy.name}` : ''}</dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            <form action={testOdooConnectionAction}><Button type="submit" size="sm" variant="outline" disabled={!configured}><CheckCircle2 /> ทดสอบการเชื่อมต่อ</Button></form>
            {conn.source === 'db' && (
              <form action={clearOdooConnectionAction}>
                <IconSubmit label="ลบค่าที่บันทึกไว้ แล้วกลับไปใช้ค่าจาก .env" tone="danger" confirm="ลบการเชื่อมต่อที่บันทึกจากหน้าเว็บ แล้วกลับไปใช้ค่า ODOO_* ใน .env?" className="w-auto gap-1.5 px-2.5"><RotateCcw /> ใช้ค่าจาก .env</IconSubmit>
              </form>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold"><KeyRound className="size-4" /> API key ของผู้ใช้นี้ใน Odoo</h2>
          <div className="p-4 text-sm">
            {!apiKeys.ok ? (
              <p className="text-muted-foreground">อ่านจาก Odoo ไม่ได้: {apiKeys.reason}<br />ดูวันหมดอายุได้ใน Odoo ที่ Preferences → Account Security → API Keys แล้วกรอกในช่อง “วันหมดอายุ” ด้านล่าง</p>
            ) : apiKeys.keys.length === 0 ? (
              <p className="text-muted-foreground">ผู้ใช้นี้ยังไม่มี API key ใน Odoo (หรือ Odoo ไม่แสดงให้)</p>
            ) : (
              <ul className="divide-y divide-border">
                {apiKeys.keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block font-medium">{k.name}</span>
                      <span className="block text-xs text-muted-foreground">สร้าง {thaiDate(k.createdAt)}{k.scope ? ` · scope ${k.scope}` : ''}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs">{apiKeys.hasExpiry ? <>{thaiDate(k.expiresAt)} {expiryBadge(k.expiresAt)}</> : <span className="text-muted-foreground">Odoo รุ่นนี้ไม่มีวันหมดอายุของ key</span>}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Odoo ไม่บอกว่า key ไหนคือ key ที่เว็บใช้อยู่ (ตัว key อ่านกลับไม่ได้) จึงแสดงทุก key ของผู้ใช้ {conn.username || '—'}</p>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold"><Save className="size-4" /> เปลี่ยนการเชื่อมต่อ</h2>
        <form action={saveOdooConnectionAction} className="grid gap-3 p-4 md:grid-cols-2">
          <label className={cn(label, 'md:col-span-2')}>ODOO_URL<Input name="url" type="url" required defaultValue={conn.url} placeholder="https://company.odoo.com" className={field} /></label>
          <label className={label}>ODOO_DB<Input name="db" required defaultValue={conn.db} placeholder="company-main" className={field} /></label>
          <label className={label}>ODOO_USERNAME<Input name="username" required defaultValue={conn.username} placeholder="api@company.com" autoComplete="off" className={field} /></label>
          <label className={label}>ODOO_API_KEY <span className="font-normal text-muted-foreground">(เว้นว่าง = ใช้ key เดิม)</span>
            <Input name="apiKey" type="password" autoComplete="new-password" placeholder={conn.apiKey ? maskSecret(conn.apiKey) : 'วาง API key จาก Odoo'} className={field} />
          </label>
          <label className={label}>วันหมดอายุของ API key <span className="font-normal text-muted-foreground">(ตามที่ Odoo แสดงตอนสร้าง key)</span>
            <Input name="apiKeyExpiresAt" type="date" defaultValue={conn.apiKeyExpiresAt ?? ''} className={field} />
          </label>
          <p className="text-xs text-muted-foreground md:col-span-2">ระบบจะลองเชื่อมต่อ (อ่านรุ่น Odoo + เข้าสู่ระบบ) ก่อนบันทึก ถ้าไม่ผ่านจะไม่เปลี่ยนค่าเดิม · เปลี่ยนแล้วมีผลกับทุกหน้าทันที (ล้างแคชสินค้า/ลูกค้า)</p>
          {!hasDedicatedSecret() && <p className="text-xs text-amber-800 md:col-span-2">แนะนำตั้ง <code>SETTINGS_SECRET</code> ใน .env (ข้อความสุ่มยาว 32 ตัวขึ้นไป) ตอนนี้ใช้คีย์ที่สร้างจาก SUPABASE_SERVICE_ROLE_KEY ในการเข้ารหัส API key ถ้าเปลี่ยน key นั้นจะต้องบันทึก API key ใหม่</p>}
          <div className="md:col-span-2"><Button type="submit" size="sm"><Save /> ทดสอบและบันทึก</Button></div>
        </form>
      </section>
    </div>
  );
}
