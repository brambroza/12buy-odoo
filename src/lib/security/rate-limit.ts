/**
 * Shared rate limiting for public entry points (login, sign-up, password reset, activation).
 *
 * Counters live in the `RateLimit` table (via the `rate_limit_hit` SQL function) so every server
 * instance sees the same numbers. When the table is unreachable (migration not applied yet, DB down)
 * the limiter falls back to an in-process window so the check never blocks a healthy request path.
 */
import { db } from '@/lib/db/client';

export type RateLimitRule = { readonly max: number; readonly windowMs: number };

export type RateLimitResult = {
  /** True when the request may proceed. */
  ok: boolean;
  /** Hits already counted in the current window (including this one). */
  count: number;
  /** Milliseconds until the window resets (0 when `ok`). */
  retryAfterMs: number;
};

/** Pure in-memory sliding window; also the fallback when the DB limiter is unavailable. */
export function createMemoryLimiter(rule: RateLimitRule) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit for `key` at `now` and says whether it was within the limit. */
    hit(key: string, now = Date.now()): RateLimitResult {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
      if (recent.length >= rule.max) {
        hits.set(key, recent);
        return { ok: false, count: recent.length, retryAfterMs: Math.max(0, recent[0] + rule.windowMs - now) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true, count: recent.length, retryAfterMs: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

const fallbacks = new Map<string, ReturnType<typeof createMemoryLimiter>>();
let warnedFallback = false;

function fallbackFor(scope: string, rule: RateLimitRule) {
  const id = `${scope}:${rule.max}:${rule.windowMs}`;
  let limiter = fallbacks.get(id);
  if (!limiter) {
    limiter = createMemoryLimiter(rule);
    fallbacks.set(id, limiter);
  }
  return limiter;
}

/**
 * Counts one hit for `key` under `scope` and tells whether it is within `rule`.
 * Keys are hashed into `scope:key`; keep `key` short (an IP or a lower-cased email).
 */
export async function hitRateLimit(scope: string, key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const fullKey = `${scope}:${key}`.slice(0, 200);
  try {
    const { data, error } = await db().rpc('rate_limit_hit', { p_key: fullKey, p_window_ms: rule.windowMs });
    if (error) throw new Error(error.message);
    const row = data as { count: number; windowStart: string } | null;
    if (!row || typeof row.count !== 'number') throw new Error('rate_limit_hit returned nothing');
    const started = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(row.windowStart) ? row.windowStart : `${row.windowStart}Z`).getTime();
    const ok = row.count <= rule.max;
    return { ok, count: row.count, retryAfterMs: ok ? 0 : Math.max(0, started + rule.windowMs - Date.now()) };
  } catch (error) {
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn('[rate-limit] DB limiter unavailable, using in-memory fallback:', error instanceof Error ? error.message : error);
    }
    return fallbackFor(scope, rule).hit(key);
  }
}

/** Test helper: clears every in-memory fallback window. */
export function resetRateLimitFallbacks() {
  fallbacks.clear();
  warnedFallback = false;
}

/** Client IP from the proxy headers (Cloudflare first, then the standard forwarded header). */
export function clientIp(headers: { get(name: string): string | null }): string {
  return headers.get('cf-connecting-ip') || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
}

/** "กรุณารอ 3 นาที" style hint for a blocked request. */
export function retryHint(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return minutes >= 60 ? `กรุณาลองใหม่ใน ${Math.ceil(minutes / 60)} ชั่วโมง` : `กรุณาลองใหม่ใน ${minutes} นาที`;
}

/** Limits per entry point. IP windows are wide (shared NAT); account windows are tight. */
export const RATE_LIMITS = {
  /** Sign-in attempts per IP. */
  loginIp: { max: 30, windowMs: 15 * 60 * 1000 },
  /** Sign-in attempts per email: a wrong password 10 times locks that email for 15 minutes. */
  loginEmail: { max: 10, windowMs: 15 * 60 * 1000 },
  /** Dealer sign-ups per IP. */
  lead: { max: 3, windowMs: 60 * 60 * 1000 },
  /** Password reset requests per IP. */
  reset: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Odoo-customer activation tries per IP (tax id + phone is guessable). */
  activate: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Sign-ins forwarded to Odoo per IP (each one is a password guess against Odoo). */
  odooLogin: { max: 10, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;
