import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/lib/shop/status-sync', () => ({ refreshOrderStatuses: refresh }));
const { POST } = await import('@/app/api/cron/odoo-status/route');

const call = (auth?: string) => POST(new Request('http://x/api/cron/odoo-status', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

describe('cron odoo-status route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    refresh.mockReset();
  });

  it('refuses calls without the secret, or when no strong secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', 'short');
    expect((await call('Bearer short')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', 'a-long-enough-cron-secret');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong-secret-of-same-len')).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('runs the sync with the right secret', async () => {
    vi.stubEnv('CRON_SECRET', 'a-long-enough-cron-secret');
    refresh.mockResolvedValueOnce({ checked: 3, changed: 1 });
    const res = await call('Bearer a-long-enough-cron-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 3, changed: 1 });
  });
});
