import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooRead: vi.fn(), odooSearchRead: vi.fn(), odooUid: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { daysUntil, listOdooApiKeys } = await import('@/lib/odoo/api-keys');

describe('listOdooApiKeys', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reads the connected user keys with expiry when Odoo has the field', async () => {
    rpc.odooUid.mockResolvedValue(7);
    rpc.odooRead.mockResolvedValue({ expiration_date: { type: 'datetime' } });
    rpc.odooSearchRead.mockResolvedValue([{ id: 1, name: 'web', scope: false, create_date: '2026-01-01 00:00:00', expiration_date: '2026-12-31 00:00:00' }]);
    const r = await listOdooApiKeys();
    expect(r).toMatchObject({ ok: true, hasExpiry: true, keys: [{ id: 1, name: 'web', scope: null, expiresAt: '2026-12-31 00:00:00' }] });
    expect(rpc.odooSearchRead.mock.calls[0][1]).toEqual([['user_id', '=', 7]]);
    expect(rpc.odooSearchRead.mock.calls[0][2]).toContain('expiration_date');
  });

  it('omits the expiry field on older Odoo', async () => {
    rpc.odooUid.mockResolvedValue(7);
    rpc.odooRead.mockResolvedValue({});
    rpc.odooSearchRead.mockResolvedValue([]);
    const r = await listOdooApiKeys();
    expect(r).toMatchObject({ ok: true, hasExpiry: false, keys: [] });
    expect(rpc.odooSearchRead.mock.calls[0][2]).not.toContain('expiration_date');
  });

  it('reports instead of throwing when Odoo refuses', async () => {
    rpc.odooUid.mockRejectedValue(new Error('Access Denied'));
    expect(await listOdooApiKeys()).toEqual({ ok: false, reason: 'Access Denied' });
  });
});

describe('daysUntil', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  it('counts whole days for dates and Odoo datetimes', () => {
    expect(daysUntil('2026-11-13', now)).toBe(13);
    expect(daysUntil('2026-11-13 00:00:00', now)).toBe(13);
    expect(daysUntil('2026-10-01', now)).toBeLessThan(0);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil('garbage', now)).toBeNull();
  });
});
