/**
 * Secrets saved from the back office (e.g. the Odoo API key) are encrypted at rest with AES-256-GCM.
 * The key comes from `SETTINGS_SECRET`; without one it is derived from the Supabase service role key,
 * so rotating that key makes older ciphertexts unreadable (the app then falls back to env values).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/** True when a dedicated `SETTINGS_SECRET` is configured (recommended; otherwise a derived key is used). */
export function hasDedicatedSecret(): boolean {
  return Boolean(process.env.SETTINGS_SECRET);
}

function keyMaterial(): Buffer {
  const secret = process.env.SETTINGS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SETTINGS_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to store secrets');
  return Buffer.from(hkdfSync('sha256', secret, 'app-settings', 'aes-256-gcm', 32));
}

/** `v1.<iv>.<tag>.<ciphertext>` (base64url parts). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** Inverse of `encryptSecret`; throws when the token is malformed or was sealed with another key. */
export function decryptSecret(token: string): string {
  const [version, iv, tag, data] = token.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
