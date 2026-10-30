/**
 * LINE settings: Messaging API channel access token (push messages), LINE Login channel (link a
 * dealer's LINE to their web login) and the staff group id. Saved from /admin/settings into
 * `AppSetting` (secrets encrypted), with `LINE_*` env vars as the fallback.
 */
import { decryptSecret, encryptSecret } from '@/lib/settings/crypto';
import { deleteSetting, getSetting, putSetting } from '@/lib/settings/repo';

export const LINE_SETTING_KEY = 'line';
const CACHE_MS = 30_000;

export type LineConfig = {
  /** Messaging API channel access token (long-lived). Empty = pushes off. */
  channelAccessToken: string;
  /** LINE Login channel used for "เชื่อม LINE" on the dealer account page. */
  loginChannelId: string;
  loginChannelSecret: string;
  /** Group the OA was added to; staff alerts (new order, slip, Odoo failure) go here. */
  adminGroupId: string;
  /** Basic id shown to dealers so they can add the OA as a friend (e.g. @12buy). */
  basicId: string;
  source: 'db' | 'env';
  updatedAt: string | null;
  updatedById: string | null;
  savedError: string | null;
};

export type StoredLineConfig = { channelAccessTokenEnc: string; loginChannelId: string; loginChannelSecretEnc: string; adminGroupId: string; basicId: string };

let cache: { value: LineConfig; expiresAt: number } | null = null;

export function envLineConfig(): LineConfig {
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
    loginChannelId: process.env.LINE_LOGIN_CHANNEL_ID ?? '',
    loginChannelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET ?? '',
    adminGroupId: process.env.LINE_ADMIN_GROUP_ID ?? '',
    basicId: process.env.LINE_BASIC_ID ?? '',
    source: 'env', updatedAt: null, updatedById: null, savedError: null,
  };
}

function hasDatabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Config in use: saved row first, env as fallback. Never throws. */
export async function getLineConfig(): Promise<LineConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const value = await resolve();
  cache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

async function resolve(): Promise<LineConfig> {
  const env = envLineConfig();
  if (!hasDatabase()) return env;
  try {
    const row = await getSetting<StoredLineConfig>(LINE_SETTING_KEY);
    if (!row) return env;
    const v = row.value;
    return {
      channelAccessToken: v.channelAccessTokenEnc ? decryptSecret(v.channelAccessTokenEnc) : '',
      loginChannelId: v.loginChannelId ?? '',
      loginChannelSecret: v.loginChannelSecretEnc ? decryptSecret(v.loginChannelSecretEnc) : '',
      adminGroupId: v.adminGroupId ?? '',
      basicId: v.basicId ?? '',
      source: 'db', updatedAt: row.updatedAt, updatedById: row.updatedById, savedError: null,
    };
  } catch (error) {
    return { ...env, savedError: `อ่านค่า LINE ที่บันทึกไว้ไม่ได้ (${error instanceof Error ? error.message : 'unknown'}) จึงใช้ค่าจาก .env แทน` };
  }
}

/** Saves the config (secrets encrypted). Blank secrets keep the current ones. */
export async function saveLineConfig(input: { channelAccessToken: string; loginChannelId: string; loginChannelSecret: string; adminGroupId: string; basicId: string }, updatedById: string): Promise<void> {
  const current = await getLineConfig();
  const token = input.channelAccessToken || current.channelAccessToken;
  const secret = input.loginChannelSecret || current.loginChannelSecret;
  const stored: StoredLineConfig = {
    channelAccessTokenEnc: token ? encryptSecret(token) : '',
    loginChannelId: input.loginChannelId,
    loginChannelSecretEnc: secret ? encryptSecret(secret) : '',
    adminGroupId: input.adminGroupId,
    basicId: input.basicId,
  };
  await putSetting(LINE_SETTING_KEY, stored, updatedById);
  cache = null;
}

export async function clearLineConfig(): Promise<void> {
  await deleteSetting(LINE_SETTING_KEY);
  cache = null;
}

/** Test helper / after save: forget the cached config. */
export function invalidateLineConfig(): void {
  cache = null;
}

/** `xoxb…1234` style mask for display. */
export function maskToken(value: string): string {
  if (!value) return '';
  return value.length <= 8 ? '••••' : `${value.slice(0, 4)}…${value.slice(-4)}`;
}
