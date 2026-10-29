import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { odooWrite, odooWritesEnabled } from '@/lib/odoo/rpc';

describe('odooWrite guard', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('ODOO_URL', 'https://odoo.test');
    vi.stubEnv('ODOO_DB', 'db');
    vi.stubEnv('ODOO_USERNAME', 'u');
    vi.stubEnv('ODOO_API_KEY', 'k');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchSpy.mockReset();
  });

  it('is off unless ODOO_READ_ONLY=false', async () => {
    vi.stubEnv('ODOO_READ_ONLY', '');
    expect(odooWritesEnabled()).toBe(false);
    await expect(odooWrite('sale.order', 'create', [[{}]])).rejects.toThrow('โหมดอ่านอย่างเดียว');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks methods outside the allow-list even when writes are on', async () => {
    vi.stubEnv('ODOO_READ_ONLY', 'false');
    await expect(odooWrite('sale.order', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('res.partner', 'write', [[1], {}])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('product.pricelist', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('product.pricelist', 'write', [[1], {}])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('sale.loyalty.coupon.wizard', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('loyalty.card', 'write', [[1], {}])).rejects.toThrow('not an allowed write');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
