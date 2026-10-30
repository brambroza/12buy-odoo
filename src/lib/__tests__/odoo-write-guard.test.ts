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
    await expect(odooWrite('res.partner', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('product.pricelist', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('product.pricelist', 'write', [[1], {}])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('sale.loyalty.coupon.wizard', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('loyalty.card', 'write', [[1], {}])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('loyalty.card', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('loyalty.program', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('loyalty.rule', 'write', [[1], {}])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('sale.advance.payment.inv', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('account.move', 'action_post', [[1]])).rejects.toThrow('not an allowed write');
    // Cancelling a web order's SO and its draft invoice is allowed; deleting or posting is not.
    await expect(odooWrite('sale.order', 'action_cancel', [[1]])).rejects.not.toThrow('not an allowed write');
    await expect(odooWrite('account.move', 'button_cancel', [[1]])).rejects.not.toThrow('not an allowed write');
    // Allowed pairs reach the network (authenticate + call); a blocked pair adds no request at all.
    expect(fetchSpy).toHaveBeenCalled();
    const reached = fetchSpy.mock.calls.length;
    await expect(odooWrite('account.move', 'button_draft', [[1]])).rejects.toThrow('not an allowed write');
    expect(fetchSpy).toHaveBeenCalledTimes(reached);
  });

  it('lets res.partner.write touch only pricelist and credit limit fields', async () => {
    vi.stubEnv('ODOO_READ_ONLY', 'false');
    await expect(odooWrite('res.partner', 'write', [[1], {}])).rejects.toThrow('may not write');
    await expect(odooWrite('res.partner', 'write', [[1], { name: 'x' }])).rejects.toThrow('may not write name');
    await expect(odooWrite('res.partner', 'write', [[1], { credit_limit: 1, vat: '1' }])).rejects.toThrow('may not write vat');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('limits chatter notes to internal message_post kwargs and attachment fields', async () => {
    vi.stubEnv('ODOO_READ_ONLY', 'false');
    await expect(odooWrite('sale.order', 'message_post', [[1]], { body: 'x', partner_ids: [2] })).rejects.toThrow('may not pass partner_ids');
    await expect(odooWrite('account.move', 'message_post', [[1]], { body: 'x', subtype_xmlid: 'mail.mt_comment', email_from: 'a@b' })).rejects.toThrow('may not pass email_from');
    await expect(odooWrite('ir.attachment', 'create', [[{ name: 'a', datas: 'b', res_model: 'sale.order', res_id: 1, public: true }]])).rejects.toThrow('may not write public');
    await expect(odooWrite('ir.attachment', 'write', [[1], { name: 'a' }])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('ir.attachment', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    await expect(odooWrite('account.move', 'write', [[1], { name: 'a' }])).rejects.toThrow('not an allowed write');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lets delivery.carrier.write touch only name, order, publish and active, and never unlink', async () => {
    vi.stubEnv('ODOO_READ_ONLY', 'false');
    await expect(odooWrite('delivery.carrier', 'write', [[1], { fixed_price: 50 }])).rejects.toThrow('may not write fixed_price');
    await expect(odooWrite('delivery.carrier', 'write', [[1], { name: 'x', product_id: 2 }])).rejects.toThrow('may not write product_id');
    await expect(odooWrite('delivery.carrier', 'unlink', [[1]])).rejects.toThrow('not an allowed write');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
