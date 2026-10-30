import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/db/__tests__/fake-db';
import type { OdooProgress } from '@/lib/odoo/order-status';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn(), odooRead: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);
let fake = createFakeDb();
vi.mock('@/lib/db/client', () => ({ db: () => fake.client }));

const { readOdooProgress, webStatusFromOdoo } = await import('@/lib/odoo/order-status');
const store = await import('@/lib/shop/store');
const { refreshOrderStatuses, refreshIfStale } = await import('@/lib/shop/status-sync');

const progress = (p: Partial<OdooProgress>): OdooProgress => ({ saleOrderId: 1, state: 'sale', deliveryStatus: 'pending', invoices: [], ...p });
const invoice = (paymentState: string) => ({ id: 1, name: 'INV/2026/001', paymentState, amountResidual: paymentState === 'paid' ? 0 : 100, dueDate: null });

describe('webStatusFromOdoo', () => {
  it('maps SO, delivery and invoice state to the web status', () => {
    expect(webStatusFromOdoo(progress({}))).toBe('PREPARING');
    expect(webStatusFromOdoo(progress({ deliveryStatus: 'partial' }))).toBe('PREPARING');
    expect(webStatusFromOdoo(progress({ deliveryStatus: 'full' }))).toBe('SHIPPED');
    expect(webStatusFromOdoo(progress({ deliveryStatus: 'full', invoices: [invoice('not_paid')] }))).toBe('INVOICED');
    expect(webStatusFromOdoo(progress({ invoices: [invoice('paid'), invoice('partial')] }))).toBe('INVOICED');
    expect(webStatusFromOdoo(progress({ invoices: [invoice('paid'), invoice('in_payment')] }))).toBe('PAID');
    expect(webStatusFromOdoo(progress({ state: 'cancel' }))).toBe('CANCELLED');
  });
});

describe('readOdooProgress', () => {
  beforeEach(() => vi.resetAllMocks());
  it('keeps only posted customer invoices', async () => {
    rpc.odooSearchRead
      .mockResolvedValueOnce([{ id: 7, name: 'S7', state: 'sale', delivery_status: 'full', invoice_ids: [1, 2, 3] }])
      .mockResolvedValueOnce([
        { id: 1, name: 'INV/1', move_type: 'out_invoice', state: 'posted', payment_state: 'paid', amount_residual: 0, invoice_date_due: '2026-11-30' },
        { id: 2, name: '/', move_type: 'out_invoice', state: 'draft', payment_state: 'not_paid', amount_residual: 5, invoice_date_due: false },
        { id: 3, name: 'RINV/1', move_type: 'out_refund', state: 'posted', payment_state: 'paid', amount_residual: 0, invoice_date_due: false },
      ]);
    const map = await readOdooProgress([7]);
    expect(map.get(7)).toEqual({ saleOrderId: 7, state: 'sale', deliveryStatus: 'full', invoices: [{ id: 1, name: 'INV/1', paymentState: 'paid', amountResidual: 0, dueDate: '2026-11-30' }] });
  });
});

describe('refreshOrderStatuses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fake = createFakeDb();
  });

  async function confirmedOrder() {
    await store.addToCart('dealer:d1', 1, 4);
    const order = await store.createOrder({ sessionId: 'dealer:d1', dealerName: 'ร้าน', address: 'x', carrier: 'y', note: '', lines: [], subtotal: 100, cashDiscount: 0, total: 100, paymentMethod: 'CREDIT' });
    await store.advanceOrder(null, order.id);
    return (await store.setOdooSync(order.id, { status: 'SYNCED', saleOrderId: 7, saleOrderName: 'S7', amountTotal: 100, error: null, at: new Date().toISOString() }))!;
  }

  it('moves forward through skipped steps and records progress', async () => {
    await confirmedOrder();
    rpc.odooSearchRead
      .mockResolvedValueOnce([{ id: 7, name: 'S7', state: 'sale', delivery_status: 'full', invoice_ids: [1] }])
      .mockResolvedValueOnce([{ id: 1, name: 'INV/1', move_type: 'out_invoice', state: 'posted', payment_state: 'not_paid', amount_residual: 100, invoice_date_due: false }]);
    expect(await refreshOrderStatuses()).toEqual({ checked: 1, changed: 1 });
    const [order] = await store.listAllOrders();
    expect(order.status).toBe('INVOICED');
    expect(order.events.map((e) => e.status)).toEqual(['PENDING', 'PREPARING', 'SHIPPED', 'INVOICED']);
    expect(order.odoo?.progress?.invoices[0].name).toBe('INV/1');
  });

  it('never moves backwards and skips orders without an SO', async () => {
    const order = await confirmedOrder();
    await store.advanceOrder(null, order.id);
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 7, name: 'S7', state: 'sale', delivery_status: 'pending', invoice_ids: [] }]);
    expect(await refreshOrderStatuses()).toEqual({ checked: 1, changed: 0 });
    expect((await store.getOrder(null, order.id))?.status).toBe('SHIPPED');
  });

  it('refreshes lazily only when the last check is stale, and survives Odoo errors', async () => {
    const order = await confirmedOrder();
    rpc.odooSearchRead.mockRejectedValueOnce(new Error('Odoo down'));
    expect((await refreshIfStale(order)).status).toBe('PREPARING');
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 7, name: 'S7', state: 'sale', delivery_status: 'full', invoice_ids: [] }]);
    const fresh = await refreshIfStale(order);
    expect(fresh.status).toBe('SHIPPED');
    expect(await refreshIfStale(fresh)).toBe(fresh);
    expect(rpc.odooSearchRead).toHaveBeenCalledTimes(2);
  });
});
