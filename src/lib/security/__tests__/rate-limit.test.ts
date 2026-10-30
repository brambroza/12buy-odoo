import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ db: () => ({ rpc: fake.rpc }) }));

import { RATE_LIMITS, clientIp, createMemoryLimiter, hitRateLimit, resetRateLimitFallbacks, retryHint } from '@/lib/security/rate-limit';

describe('createMemoryLimiter', () => {
  it('allows up to max hits inside the window, then blocks with a retry hint', () => {
    const limiter = createMemoryLimiter({ max: 3, windowMs: 1000 });
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('a', 10).ok).toBe(true);
    expect(limiter.hit('a', 20)).toEqual({ ok: true, count: 3, retryAfterMs: 0 });
    expect(limiter.hit('a', 30)).toEqual({ ok: false, count: 3, retryAfterMs: 970 });
    expect(limiter.hit('b', 30).ok).toBe(true);
  });

  it('frees the slot once the window has passed', () => {
    const limiter = createMemoryLimiter({ max: 1, windowMs: 1000 });
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('a', 999).ok).toBe(false);
    expect(limiter.hit('a', 1000).ok).toBe(true);
  });
});

describe('hitRateLimit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetRateLimitFallbacks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('uses the shared SQL counter and blocks once count exceeds max', async () => {
    fake.rpc.mockResolvedValueOnce({ data: { count: 2, windowStart: '2026-10-30T00:00:00' }, error: null });
    await expect(hitRateLimit('login-ip', '1.1.1.1', { max: 2, windowMs: 60_000 })).resolves.toMatchObject({ ok: true, count: 2 });
    expect(fake.rpc).toHaveBeenCalledWith('rate_limit_hit', { p_key: 'login-ip:1.1.1.1', p_window_ms: 60_000 });

    fake.rpc.mockResolvedValueOnce({ data: { count: 3, windowStart: new Date().toISOString() }, error: null });
    const blocked = await hitRateLimit('login-ip', '1.1.1.1', { max: 2, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('falls back to the in-memory window when the DB is unavailable', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'relation "RateLimit" does not exist' } });
    const rule = { max: 1, windowMs: 60_000 };
    await expect(hitRateLimit('lead', 'ip', rule)).resolves.toMatchObject({ ok: true });
    await expect(hitRateLimit('lead', 'ip', rule)).resolves.toMatchObject({ ok: false });
    await expect(hitRateLimit('lead', 'other', rule)).resolves.toMatchObject({ ok: true });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('helpers', () => {
  it('reads the client IP from proxy headers in priority order', () => {
    const h = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null });
    expect(clientIp(h({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('9.9.9.9');
    expect(clientIp(h({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(h({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(h({}))).toBe('unknown');
  });

  it('phrases the wait in minutes or hours', () => {
    expect(retryHint(30_000)).toBe('กรุณาลองใหม่ใน 1 นาที');
    expect(retryHint(14 * 60_000)).toBe('กรุณาลองใหม่ใน 14 นาที');
    expect(retryHint(90 * 60_000)).toBe('กรุณาลองใหม่ใน 2 ชั่วโมง');
  });

  it('keeps the email window tighter than the IP window for login', () => {
    expect(RATE_LIMITS.loginEmail.max).toBeLessThan(RATE_LIMITS.loginIp.max);
  });
});
