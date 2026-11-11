/**
 * Credit policy shared by every dealer: how many days past an invoice's due date credit ordering stays
 * open ("ผ่อนผัน"). Saved from /admin/settings into `AppSetting` (key `credit-policy`); until it is saved
 * the default applies. One value for the whole system, by the client's decision (2026-11-11).
 */
import { getSetting, putSetting } from '@/lib/settings/repo';

export const CREDIT_POLICY_KEY = 'credit-policy';
/** Grace days used until an admin saves a value. */
export const DEFAULT_OVERDUE_GRACE_DAYS = 10;
/** Upper bound accepted from the settings form. */
export const MAX_OVERDUE_GRACE_DAYS = 60;
const CACHE_MS = 30_000;

export type CreditPolicy = {
  /** Days after the due date before an unpaid invoice locks credit ordering; 0 = lock the day after due. */
  overdueGraceDays: number;
  source: 'db' | 'default';
  updatedAt: string | null;
  updatedById: string | null;
};

type StoredCreditPolicy = { overdueGraceDays?: unknown };

let cache: { value: CreditPolicy; expiresAt: number } | null = null;

/**
 * Grace days from a stored or typed value: whole number between 0 and {@link MAX_OVERDUE_GRACE_DAYS};
 * anything else falls back to `fallback`.
 */
export function parseGraceDays(raw: unknown, fallback = DEFAULT_OVERDUE_GRACE_DAYS): number {
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_OVERDUE_GRACE_DAYS) return fallback;
  return n;
}

/** Policy in use (cached 30 s). A missing or broken setting row means the default. */
export async function getCreditPolicy(): Promise<CreditPolicy> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  let value: CreditPolicy = { overdueGraceDays: DEFAULT_OVERDUE_GRACE_DAYS, source: 'default', updatedAt: null, updatedById: null };
  try {
    const row = await getSetting<StoredCreditPolicy>(CREDIT_POLICY_KEY);
    if (row) value = { overdueGraceDays: parseGraceDays(row.value?.overdueGraceDays), source: 'db', updatedAt: row.updatedAt, updatedById: row.updatedById };
  } catch (error) {
    console.warn('[credit-policy] setting unavailable, using default', error instanceof Error ? error.message : error);
  }
  cache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

/** Grace days only; never throws. */
export async function getOverdueGraceDays(): Promise<number> {
  return (await getCreditPolicy()).overdueGraceDays;
}

/** Saves the policy from the settings page and drops the cache. */
export async function saveCreditPolicy(input: { overdueGraceDays: number }, updatedById: string): Promise<void> {
  const overdueGraceDays = parseGraceDays(input.overdueGraceDays, -1);
  if (overdueGraceDays < 0) throw new Error(`overdueGraceDays must be 0-${MAX_OVERDUE_GRACE_DAYS}`);
  await putSetting(CREDIT_POLICY_KEY, { overdueGraceDays }, updatedById);
  cache = null;
}

/** Test hook. */
export function invalidateCreditPolicy(): void {
  cache = null;
}
