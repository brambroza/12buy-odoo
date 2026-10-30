import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProtoOrder } from '@/lib/shop/types';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { cancelOrderInOdoo, needsOdooCancel } = await import('@/lib/odoo/cancel');

const order = (odoo?: ProtoOrder['odoo']): ProtoOrder => ({ id: 'o1', ref: 'WEB-1', odoo } as unknown as ProtoOrder);
const sync = (extra: Partial<NonNullable<ProtoOrder['odoo']>> = {}): ProtoOrder['odoo'] => ({ status: 'SYNCED', saleOrderId: 77, saleOrderName: 'S00077', amountTotal: 1, error: null, at: '', ...extra });

describe('needsOdooCancel', () => {
  it('is true only for orders with an SO whose Odoo cancel has not succeeded yet', () => {
    expect(needsOdooCancel(order())).toBe(false);
    expect(needsOdooCancel(order(sync()))).toBe(true);
    expect(needsOdooCancel(order(sync({ cancel: { ok: false, at: '', error: 'x' } })))).toBe(true);
    expect(needsOdooCancel(order(sync({ cancel: { ok: true, at: '' } })))).toBe(false);
  });
});

describe('cancelOrderInOdoo', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does nothing for an order without an SO', async () => {
    await expect(cancelOrderInOdoo(order())).resolves.toMatchObject({ ok: true });
    expect(rpc.odooWrite).not.toHaveBeenCalled();
  });

  it('cancels draft invoices then the SO, skipping the email wizard', async () => {
    rpc.odooSearchRead.mockImplementation(async (model: string) => model === 'sale.order'
      ? [{ id: 77, state: 'sale', invoice_ids: [5] }]
      : [{ id: 5, name: false, state: 'draft' }]);
    rpc.odooWrite.mockResolvedValue(true);
    const result = await cancelOrderInOdoo(order(sync()));
    expect(result.ok).toBe(true);
    expect(rpc.odooWrite.mock.calls).toEqual([
      ['account.move', 'button_cancel', [[5]]],
      ['sale.order', 'action_cancel', [[77]], { context: { disable_cancel_warning: true } }],
    ]);
  });

  it('refuses when an invoice is already posted and names it', async () => {
    rpc.odooSearchRead.mockImplementation(async (model: string) => model === 'sale.order'
      ? [{ id: 77, state: 'sale', invoice_ids: [5] }]
      : [{ id: 5, name: 'INV/2026/0001', state: 'posted' }]);
    const result = await cancelOrderInOdoo(order(sync()));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('INV/2026/0001') });
    expect(rpc.odooWrite).not.toHaveBeenCalled();
  });

  it('treats an already-cancelled or missing SO as done', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 77, state: 'cancel', invoice_ids: [] }]);
    await expect(cancelOrderInOdoo(order(sync()))).resolves.toMatchObject({ ok: true, note: expect.stringContaining('อยู่แล้ว') });
    rpc.odooSearchRead.mockResolvedValueOnce([]);
    await expect(cancelOrderInOdoo(order(sync()))).resolves.toMatchObject({ ok: true });
    expect(rpc.odooWrite).not.toHaveBeenCalled();
  });

  it('returns the Odoo error instead of throwing', async () => {
    rpc.odooSearchRead.mockRejectedValue(new Error('Odoo HTTP 500'));
    await expect(cancelOrderInOdoo(order(sync()))).resolves.toMatchObject({ ok: false, error: 'Odoo HTTP 500' });
  });
});
