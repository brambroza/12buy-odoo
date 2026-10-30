/**
 * API keys of the Odoo user the web signs in as (`res.users.apikeys`). Odoo 17+ records an optional
 * expiration date per key; the key's secret is never readable, so the list shows names and dates only.
 * Read-only and best-effort: some Odoo setups do not let a user read this model over RPC.
 */
import { odooRead, odooSearchRead, odooUid } from './rpc';

export type OdooApiKey = { id: number; name: string; scope: string | null; createdAt: string | null; expiresAt: string | null };

export type OdooApiKeyList =
  | { ok: true; keys: OdooApiKey[]; hasExpiry: boolean }
  | { ok: false; reason: string };

type KeyRow = { id: number; name: string; scope: string | false; create_date: string | false; expiration_date?: string | false };

/** Keys of the connected user, soonest expiry first. */
export async function listOdooApiKeys(): Promise<OdooApiKeyList> {
  try {
    const uid = await odooUid();
    const fields = await odooRead<Record<string, unknown>>('res.users.apikeys', 'fields_get', [['expiration_date']], { attributes: ['type'] });
    const hasExpiry = 'expiration_date' in fields;
    const rows = await odooSearchRead<KeyRow>('res.users.apikeys', [['user_id', '=', uid]],
      ['id', 'name', 'scope', 'create_date', ...(hasExpiry ? ['expiration_date'] : [])], { limit: 50, order: hasExpiry ? 'expiration_date asc, id asc' : 'id asc' });
    const keys = rows.map((r) => ({ id: r.id, name: r.name, scope: r.scope || null, createdAt: r.create_date || null, expiresAt: r.expiration_date || null }));
    return { ok: true, keys, hasExpiry };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'อ่านรายการ API key จาก Odoo ไม่ได้' };
  }
}

/** Days from now until `date` (negative when past); null when there is no date. */
export function daysUntil(date: string | null, now = new Date()): number | null {
  if (!date) return null;
  const at = new Date(date.includes('T') || date.includes(' ') ? date.replace(' ', 'T') + (date.endsWith('Z') ? '' : 'Z') : `${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  return Math.floor((at.getTime() - now.getTime()) / 86_400_000);
}
