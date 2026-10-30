/**
 * Where the Odoo connection comes from: the `odoo` row in `AppSetting` (saved from /admin/settings,
 * API key encrypted) when present and readable, otherwise the `ODOO_*` env vars. Cached briefly per
 * server instance so RPC calls do not hit the database each time.
 */
import { decryptSecret, encryptSecret } from '@/lib/settings/crypto';
import { deleteSetting, getSetting, putSetting } from '@/lib/settings/repo';

export const ODOO_SETTING_KEY = 'odoo';
const CACHE_MS = 30_000;

export type OdooConnection = {
  url: string;
  db: string;
  username: string;
  apiKey: string;
  /** `db` = saved from the back office; `env` = ODOO_* variables. */
  source: 'db' | 'env';
  /** When the API key expires, as told by the admin who saved it (Odoo shows it when the key is made). */
  apiKeyExpiresAt: string | null;
  updatedAt: string | null;
  updatedById: string | null;
  /** Set when a saved row exists but could not be used (e.g. sealed with another SETTINGS_SECRET). */
  savedError: string | null;
};

/** What is stored in `AppSetting.value` for the `odoo` key. The API key is never stored in clear. */
export type StoredOdooConnection = { url: string; db: string; username: string; apiKeyEnc: string; apiKeyExpiresAt: string | null };

let cache: { value: OdooConnection; expiresAt: number } | null = null;

/** Connection from env vars only (may be incomplete; callers validate). */
export function envOdooConnection(): OdooConnection {
  return {
    url: (process.env.ODOO_URL ?? '').trim().replace(/\/+$/, ''),
    db: process.env.ODOO_DB ?? '',
    username: process.env.ODOO_USERNAME ?? '',
    apiKey: process.env.ODOO_API_KEY ?? '',
    source: 'env', apiKeyExpiresAt: null, updatedAt: null, updatedById: null, savedError: null,
  };
}

/** True when the app has a database to read settings from (tests and bare scripts do not). */
function hasDatabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** The connection to use now: saved row first, env as fallback. Errors reading the row never break Odoo calls. */
export async function getOdooConnection(): Promise<OdooConnection> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const value = await resolveConnection();
  cache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

async function resolveConnection(): Promise<OdooConnection> {
  const env = envOdooConnection();
  if (!hasDatabase()) return env;
  let row: Awaited<ReturnType<typeof getSetting<StoredOdooConnection>>>;
  try {
    row = await getSetting<StoredOdooConnection>(ODOO_SETTING_KEY);
  } catch (error) {
    console.error('[odoo] settings read failed, using env', error instanceof Error ? error.message : error);
    return env;
  }
  if (!row) return env;
  try {
    return {
      url: row.value.url, db: row.value.db, username: row.value.username, apiKey: decryptSecret(row.value.apiKeyEnc),
      source: 'db', apiKeyExpiresAt: row.value.apiKeyExpiresAt ?? null, updatedAt: row.updatedAt, updatedById: row.updatedById, savedError: null,
    };
  } catch (error) {
    console.error('[odoo] saved connection unusable, using env', error instanceof Error ? error.message : error);
    return { ...env, savedError: 'ถอดรหัส API key ที่บันทึกไว้ไม่ได้ (SETTINGS_SECRET เปลี่ยน?) จึงใช้ค่าจาก .env แทน' };
  }
}

/** Forgets the cached connection (call after saving or clearing it). */
export function invalidateOdooConnection(): void {
  cache = null;
}

/** Stores a connection for the back office; `apiKey` is sealed before it reaches the database. */
export async function saveOdooConnection(input: { url: string; db: string; username: string; apiKey: string; apiKeyExpiresAt: string | null }, actorId: string): Promise<void> {
  const value: StoredOdooConnection = {
    url: input.url.trim().replace(/\/+$/, ''), db: input.db.trim(), username: input.username.trim(),
    apiKeyEnc: encryptSecret(input.apiKey), apiKeyExpiresAt: input.apiKeyExpiresAt,
  };
  await putSetting(ODOO_SETTING_KEY, value, actorId);
  invalidateOdooConnection();
}

/** Drops the saved connection so the env vars apply again. */
export async function clearOdooConnection(): Promise<void> {
  await deleteSetting(ODOO_SETTING_KEY);
  invalidateOdooConnection();
}

/** `abcd…wxyz` style preview that never reveals the key: first 4 and last 4 characters. */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '•'.repeat(secret.length);
  return `${secret.slice(0, 4)}${'•'.repeat(Math.min(12, secret.length - 8))}${secret.slice(-4)}`;
}
