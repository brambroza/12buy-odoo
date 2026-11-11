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
import { clearLineConfig, getLineConfig, saveLineConfig } from '@/lib/notify/line-config';
import { flexCard, linePush } from '@/lib/notify/line';
import { clearMailConfig, getMailConfig, saveMailConfig } from '@/lib/mail/config';
import { sendMail, verifyMailConfig } from '@/lib/mail/send';
import { testEmail } from '@/lib/mail/templates';
import { SITE } from '@/lib/seo';
import { MAX_OVERDUE_GRACE_DAYS, getCreditPolicy, saveCreditPolicy } from '@/lib/shop/credit-policy';

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

// ---------- LINE ----------

const lineSchema = z.object({
  channelAccessToken: z.string().trim().max(400),
  loginChannelId: z.string().trim().regex(/^\d{0,20}$/, 'Channel ID ของ LINE Login เป็นตัวเลข'),
  loginChannelSecret: z.string().trim().max(200),
  adminGroupId: z.string().trim().regex(/^(C[0-9a-f]{32}|U[0-9a-f]{32})?$/i, 'Group ID ขึ้นต้นด้วย C ตามด้วย 32 ตัวอักษร (ดูจาก webhook event หรือ LINE Developers)'),
  basicId: z.string().trim().max(40).transform((v) => (v && !v.startsWith('@') ? `@${v}` : v)),
});

/** Saves LINE Messaging API / LINE Login settings (secrets encrypted; blank keeps the current secret). */
export async function saveLineConfigAction(formData: FormData) {
  const actor = await requireAdmin();
  const s = (k: string) => String(formData.get(k) ?? '');
  const parsed = lineSchema.safeParse({ channelAccessToken: s('channelAccessToken'), loginChannelId: s('loginChannelId'), loginChannelSecret: s('loginChannelSecret'), adminGroupId: s('adminGroupId'), basicId: s('basicId') });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  await saveLineConfig(parsed.data, actor.id);
  await audit(actor.id, 'settings.line', 'AppSetting', 'line', { loginChannelId: parsed.data.loginChannelId, adminGroupId: parsed.data.adminGroupId, basicId: parsed.data.basicId, tokenChanged: Boolean(parsed.data.channelAccessToken), secretChanged: Boolean(parsed.data.loginChannelSecret) });
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
  await flash('บันทึกการตั้งค่า LINE แล้ว', { icon: 'save', description: 'กด “ส่งข้อความทดสอบ” เพื่อตรวจว่าถึงกลุ่มทีมงาน' });
  redirect(`${PAGE}?saved=1#line`);
}

export async function clearLineConfigAction() {
  const actor = await requireAdmin();
  await clearLineConfig();
  await audit(actor.id, 'settings.line_clear', 'AppSetting', 'line');
  revalidatePath('/admin', 'layout');
  await flash('กลับไปใช้ค่า LINE จาก .env แล้ว', { type: 'info', icon: 'sync' });
  redirect(`${PAGE}#line`);
}

/** Pushes a test card to the staff group with the config in use. */
export async function testLinePushAction() {
  const actor = await requireAdmin();
  const config = await getLineConfig();
  if (!config.channelAccessToken) {
    await flash('ยังไม่ได้ตั้ง channel access token', { type: 'error', icon: 'cancel' });
    redirect(`${PAGE}#line`);
  }
  if (!config.adminGroupId) {
    await flash('ยังไม่ได้ตั้ง Group ID ของทีมงาน', { type: 'error', icon: 'cancel', description: 'เพิ่ม OA เข้ากลุ่ม แล้วนำ groupId จาก webhook event มาใส่' });
    redirect(`${PAGE}#line`);
  }
  const result = await linePush(config.adminGroupId, [flexCard({ title: 'ทดสอบการแจ้งเตือน', body: `ส่งจากหลังบ้านโดย ${actor.name} · ถ้าเห็นข้อความนี้ แปลว่าตั้งค่า LINE ถูกต้อง`, accent: '#1f2937' })]);
  await flash(result.ok ? 'ส่งข้อความทดสอบแล้ว' : 'ส่งไม่สำเร็จ', result.ok ? { icon: 'send', description: 'ดูในกลุ่ม LINE ของทีมงาน' } : { type: 'error', icon: 'cancel', description: result.error });
  redirect(`${PAGE}#line`);
}

const mailSchema = z.object({
  host: z.string().trim().max(253).regex(/^[a-z0-9.-]*$/i, 'SMTP host ไม่ถูกต้อง (เช่น smtp.gmail.com)'),
  port: z.string().trim().regex(/^\d{1,5}$/, 'พอร์ตเป็นตัวเลข เช่น 587 หรือ 465').transform(Number).refine((n) => n > 0 && n <= 65535, 'พอร์ตต้องอยู่ระหว่าง 1-65535'),
  secure: z.enum(['auto', 'true', 'false']),
  user: z.string().trim().max(254),
  /** Blank keeps the password already in use. */
  pass: z.string().max(500),
  from: z.string().trim().min(1, 'กรอกผู้ส่ง (From) เช่น ร้านยาง <no-reply@company.com>').max(254)
    .refine((v) => /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/.test(v) || /^.+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(v), 'ผู้ส่งต้องเป็นอีเมล หรือ ชื่อ <อีเมล>'),
});

/** Saves outgoing email (SMTP) settings after verifying the connection; a blank password keeps the current one. */
export async function saveMailConfigAction(formData: FormData) {
  const actor = await requireAdmin();
  const s = (k: string) => String(formData.get(k) ?? '');
  const parsed = mailSchema.safeParse({ host: s('host'), port: s('port') || '587', secure: s('secure') || 'auto', user: s('user'), pass: s('pass'), from: s('from') });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const current = await getMailConfig();
  const input = { host: parsed.data.host, port: parsed.data.port, secure: parsed.data.secure === 'auto' ? parsed.data.port === 465 : parsed.data.secure === 'true', user: parsed.data.user, pass: parsed.data.pass || current.pass, from: parsed.data.from };
  if (input.host) {
    const probe = await verifyMailConfig({ ...current, ...input });
    if (!probe.ok) fail(`เชื่อมต่อ SMTP ไม่สำเร็จ ไม่ได้บันทึก: ${probe.error}`);
  }
  await saveMailConfig(input, actor.id);
  await audit(actor.id, 'settings.mail', 'AppSetting', 'mail', { host: input.host, port: input.port, secure: input.secure, user: input.user, from: input.from, passChanged: Boolean(parsed.data.pass) });
  revalidatePath('/admin', 'layout');
  await flash('บันทึกการตั้งค่าอีเมลแล้ว', { icon: 'save', description: 'กด “ส่งอีเมลทดสอบ” เพื่อตรวจว่าถึงกล่องจดหมาย' });
  redirect(`${PAGE}?saved=1#mail`);
}

export async function clearMailConfigAction() {
  const actor = await requireAdmin();
  await clearMailConfig();
  await audit(actor.id, 'settings.mail_clear', 'AppSetting', 'mail');
  revalidatePath('/admin', 'layout');
  await flash('กลับไปใช้ค่าอีเมลจาก .env แล้ว', { type: 'info', icon: 'sync' });
  redirect(`${PAGE}#mail`);
}

/** Sends a test email to the signed-in admin with the config in use. */
export async function testMailAction() {
  const actor = await requireAdmin();
  const result = await sendMail({ to: actor.email, ...testEmail({ brand: SITE.name, sentBy: actor.name }) });
  await flash(result.ok ? 'ส่งอีเมลทดสอบแล้ว' : 'ส่งอีเมลไม่สำเร็จ', result.ok ? { icon: 'mail', description: `ดูในกล่องจดหมายของ ${actor.email}` } : { type: 'error', icon: 'cancel', description: result.error });
  redirect(`${PAGE}#mail`);
}

const creditPolicySchema = z.object({
  graceDays: z.string().trim().regex(/^\d{1,2}$/, 'จำนวนวันผ่อนผันต้องเป็นตัวเลข 0-' + MAX_OVERDUE_GRACE_DAYS).transform(Number)
    .refine((n) => n >= 0 && n <= MAX_OVERDUE_GRACE_DAYS, `จำนวนวันผ่อนผันต้องอยู่ระหว่าง 0-${MAX_OVERDUE_GRACE_DAYS}`),
});

/**
 * Saves the credit policy (grace days after an invoice's due date before credit ordering locks).
 * One value for every dealer; takes effect on the next checkout and in the next daily reminder run.
 */
export async function saveCreditPolicyAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = creditPolicySchema.safeParse({ graceDays: String(formData.get('graceDays') ?? '') });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const before = await getCreditPolicy();
  await saveCreditPolicy({ overdueGraceDays: parsed.data.graceDays }, actor.id);
  await audit(actor.id, 'settings.credit_policy', 'AppSetting', 'credit-policy', { overdueGraceDays: { from: before.overdueGraceDays, to: parsed.data.graceDays } });
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
  await flash('บันทึกนโยบายเครดิตแล้ว', { icon: 'save', description: `ผ่อนผัน ${parsed.data.graceDays} วันหลังครบกำหนด จากนั้นปิดสั่งเครดิต` });
  redirect(`${PAGE}?saved=1#credit`);
}
