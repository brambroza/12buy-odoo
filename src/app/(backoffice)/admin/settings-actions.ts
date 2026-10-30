'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { requireAdmin } from '@/lib/auth/session';
import { flash } from '@/lib/flash';
import { clearOdooConnection, getOdooConnection, saveOdooConnection } from '@/lib/odoo/connection';
import { probeOdooConnection, resetOdooSession } from '@/lib/odoo/rpc';
import { clearPartnerCache, clearReferenceCache } from '@/lib/shop/catalog';

const PAGE = '/admin/settings';

const connectionSchema = z.object({
  url: z.string().trim().url('URL ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)').refine((u) => /^https?:\/\//.test(u), 'URL ต้องขึ้นต้นด้วย http:// หรือ https://').transform((u) => u.replace(/\/+$/, '')),
  db: z.string().trim().min(1, 'กรอกชื่อฐานข้อมูล').max(120),
  username: z.string().trim().min(1, 'กรอกชื่อผู้ใช้ Odoo (อีเมลที่ใช้เข้า Odoo)').max(254),
  /** Blank keeps the key already in use. */
  apiKey: z.string().trim().max(200),
  apiKeyExpiresAt: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'วันหมดอายุไม่ถูกต้อง').transform((v) => v || null),
});

function fail(message: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(message)}`);
}

/** Drops every cache that depends on which Odoo we talk to. */
function forgetOdooCaches() {
  resetOdooSession();
  clearReferenceCache();
  clearPartnerCache();
}

/**
 * Saves the Odoo connection from the settings page. The credentials are tried against Odoo first
 * (version + authenticate); a connection that does not work is never saved, so the shop keeps running
 * on the previous one. The API key is stored encrypted; the audit log records only its last 4 characters.
 */
export async function saveOdooConnectionAction(formData: FormData) {
  const actor = await requireAdmin();
  const s = (k: string) => String(formData.get(k) ?? '');
  const parsed = connectionSchema.safeParse({ url: s('url'), db: s('db'), username: s('username'), apiKey: s('apiKey'), apiKeyExpiresAt: s('apiKeyExpiresAt') });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const current = await getOdooConnection();
  const apiKey = parsed.data.apiKey || current.apiKey;
  if (!apiKey) fail('กรอก API key');
  let probe: Awaited<ReturnType<typeof probeOdooConnection>>;
  try {
    probe = await probeOdooConnection({ url: parsed.data.url, db: parsed.data.db, username: parsed.data.username, apiKey });
  } catch (error) {
    fail(`เชื่อมต่อไม่สำเร็จ ยังไม่บันทึก: ${error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'}`);
  }
  await saveOdooConnection({ ...parsed.data, apiKey }, actor.id);
  forgetOdooCaches();
  await audit(actor.id, 'settings.odoo_connection', 'AppSetting', 'odoo', {
    url: parsed.data.url, db: parsed.data.db, username: parsed.data.username, apiKeyLast4: apiKey.slice(-4), apiKeyChanged: Boolean(parsed.data.apiKey),
    apiKeyExpiresAt: parsed.data.apiKeyExpiresAt, odooUid: probe.uid, serverVersion: probe.serverVersion,
  });
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
  await flash('บันทึกการเชื่อมต่อ Odoo แล้ว', { icon: 'sync', description: `${parsed.data.url} · ${parsed.data.db} · Odoo ${probe.serverVersion} · uid ${probe.uid}` });
  redirect(`${PAGE}?saved=1`);
}

/** Removes the saved connection so the `ODOO_*` env vars apply again. */
export async function clearOdooConnectionAction() {
  const actor = await requireAdmin();
  await clearOdooConnection();
  forgetOdooCaches();
  await audit(actor.id, 'settings.odoo_connection_clear', 'AppSetting', 'odoo');
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
  await flash('กลับไปใช้ค่าจาก .env แล้ว', { type: 'info', icon: 'sync' });
  redirect(`${PAGE}?saved=1`);
}

/** Checks the connection in use right now (no changes); the result shows as a toast. */
export async function testOdooConnectionAction() {
  await requireAdmin();
  const conn = await getOdooConnection();
  try {
    const probe = await probeOdooConnection(conn);
    await flash('เชื่อมต่อ Odoo ได้', { icon: 'check', description: `Odoo ${probe.serverVersion} · ฐานข้อมูล ${conn.db} · uid ${probe.uid}` });
  } catch (error) {
    await flash('เชื่อมต่อ Odoo ไม่ได้', { type: 'error', icon: 'cancel', description: error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ' });
  }
  redirect(PAGE);
}
