/**
 * Outgoing email (SMTP) settings: used for temporary passwords and other transactional mail.
 * Saved from /admin/settings into `AppSetting` (password encrypted), with `SMTP_*` / `MAIL_FROM`
 * env vars as the fallback. Same shape as the LINE settings so the admin page treats both alike.
 */
import { decryptSecret, encryptSecret } from '@/lib/settings/crypto';
import { deleteSetting, getSetting, putSetting } from '@/lib/settings/repo';

export const MAIL_SETTING_KEY = 'mail';
const CACHE_MS = 30_000;

export type MailConfig = {
  /** SMTP host, e.g. smtp.gmail.com. Empty = email sending off. */
  host: string;
  /** 465 (implicit TLS) or 587 (STARTTLS). */
  port: number;
  /** True for port 465 style implicit TLS. */
  secure: boolean;
  user: string;
  pass: string;
  /** Sender shown to the recipient, e.g. `ร้านยาง <no-reply@company.com>`. */
  from: string;
  source: 'db' | 'env';
  updatedAt: string | null;
  updatedById: string | null;
  savedError: string | null;
};

export type StoredMailConfig = { host: string; port: number; secure: boolean; user: string; passEnc: string; from: string };

export type MailConfigInput = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };

let cache: { value: MailConfig; expiresAt: number } | null = null;

/** Parses `SMTP_PORT`-style text into a port number (default 587, 465 when SMTP_SECURE=true). */
export function parsePort(raw: string | undefined, secure: boolean): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0 && n <= 65535) return n;
  return secure ? 465 : 587;
}

/** `SMTP_SECURE=true|1|yes` → true; unset → true only when the port is 465. */
export function parseSecure(raw: string | undefined, port: string | undefined): boolean {
  if (raw !== undefined && raw !== '') return /^(1|true|yes)$/i.test(raw.trim());
  return port?.trim() === '465';
}

export function envMailConfig(): MailConfig {
  const secure = parseSecure(process.env.SMTP_SECURE, process.env.SMTP_PORT);
  return {
    host: process.env.SMTP_HOST?.trim() ?? '',
    port: parsePort(process.env.SMTP_PORT, secure),
    secure,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || '',
    source: 'env', updatedAt: null, updatedById: null, savedError: null,
  };
}

function hasDatabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** True when the config has everything needed to send (host + sender). Auth is optional for relay hosts. */
export function mailConfigured(config: Pick<MailConfig, 'host' | 'from'>): boolean {
  return Boolean(config.host && config.from);
}

/** Config in use: saved row first, env as fallback. Never throws. */
export async function getMailConfig(): Promise<MailConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const value = await resolve();
  cache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

async function resolve(): Promise<MailConfig> {
  const env = envMailConfig();
  if (!hasDatabase()) return env;
  try {
    const row = await getSetting<StoredMailConfig>(MAIL_SETTING_KEY);
    if (!row) return env;
    const v = row.value;
    return {
      host: v.host ?? '',
      port: Number(v.port) || (v.secure ? 465 : 587),
      secure: Boolean(v.secure),
      user: v.user ?? '',
      pass: v.passEnc ? decryptSecret(v.passEnc) : '',
      from: v.from ?? '',
      source: 'db', updatedAt: row.updatedAt, updatedById: row.updatedById, savedError: null,
    };
  } catch (error) {
    return { ...env, savedError: `อ่านค่าอีเมลที่บันทึกไว้ไม่ได้ (${error instanceof Error ? error.message : 'unknown'}) จึงใช้ค่าจาก .env แทน` };
  }
}

/** Saves the config (password encrypted). A blank password keeps the current one. */
export async function saveMailConfig(input: MailConfigInput, updatedById: string): Promise<void> {
  const current = await getMailConfig();
  const pass = input.pass || current.pass;
  const stored: StoredMailConfig = { host: input.host, port: input.port, secure: input.secure, user: input.user, passEnc: pass ? encryptSecret(pass) : '', from: input.from };
  await putSetting(MAIL_SETTING_KEY, stored, updatedById);
  cache = null;
}

export async function clearMailConfig(): Promise<void> {
  await deleteSetting(MAIL_SETTING_KEY);
  cache = null;
}

/** Test helper / after save: forget the cached config. */
export function invalidateMailConfig(): void {
  cache = null;
}
