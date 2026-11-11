import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
const reminders = vi.hoisted(() => vi.fn());
vi.mock('@/lib/shop/status-sync', () => ({ refreshOrderStatuses: refresh }));
vi.mock('@/lib/shop/overdue-reminders', () => ({ runOverdueReminders: reminders }));
const { POST } = await import('@/app/api/cron/odoo-status/route');

const call = (auth?: string) => POST(new Request('http://x/api/cron/odoo-status', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

describe('cron odoo-status route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    refresh.mockReset();
    reminders.mockReset();
  });

  it('refuses calls without the secret, or when no strong secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', 'short');
    expect((await call('Bearer short')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', 'a-long-enough-cron-secret');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong-secret-of-same-len')).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('runs the sync and then the overdue reminders with the right secret', async () => {
    vi.stubEnv('CRON_SECRET', 'a-long-enough-cron-secret');
    refresh.mockResolvedValueOnce({ checked: 3, changed: 1 });
    const run = { dealers: 2, inGrace: 1, locked: 0, notified: 1, failed: 0 };
    reminders.mockResolvedValueOnce(run);
    const res = await call('Bearer a-long-enough-cron-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 3, changed: 1, reminders: run });
    expect(reminders).toHaveBeenCalledTimes(1);
  });

  it('still reports the sync when the reminders fail', async () => {
    vi.stubEnv('CRON_SECRET', 'a-long-enough-cron-secret');
    refresh.mockResolvedValueOnce({ checked: 1, changed: 0 });
    reminders.mockRejectedValueOnce(new Error('db down'));
    const res = await call('Bearer a-long-enough-cron-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, changed: 0, reminders: null });
  });
});
