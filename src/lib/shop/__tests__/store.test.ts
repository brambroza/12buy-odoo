import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/db/__tests__/fake-db';
import type { NewOrder } from '../store';

let fake = createFakeDb();
vi.mock('@/lib/db/client', () => ({ db: () => fake.client }));

const store = await import('../store');

beforeEach(() => {
  fake = createFakeDb();
});

const orderInput = () => ({
  sessionId: 'A', dealerName: 'ร้าน A', address: 'กทม', carrier: 'รถบริษัท', note: '',
  lines: [{ productId: 1, name: 'ยาง', code: 'X', size: '195/65R15', qty: 4, unitPrice: 2400 }], subtotal: 9600, cashDiscount: 0, total: 9600, paymentMethod: 'CASH' as const,
});

/** Orders can only be placed from a non-empty cart (the DB function refuses an empty one). */
async function placeOrder(input: NewOrder = orderInput()) {
  await store.addToCart(input.sessionId, 1, 4);
  return store.createOrder(input);
}

describe('cart', () => {
  it('keeps pack lines separate from base-unit lines and sums pack counts', async () => {
    const pack = { id: 32, name: 'มัด 3 เส้น', factor: 3 };
    await store.addToCart('U', 7, 4);
    await store.addToCart('U', 7, 6, pack, 2);
    await store.addToCart('U', 7, 3, pack, 1);
    expect(await store.getCart('U')).toEqual([
      { productId: 7, qty: 4 },
      { productId: 7, qty: 9, unitId: 32, unitQty: 3, unitName: 'มัด 3 เส้น' },
    ]);
  });

  it('switches a line between base units and packs, keeping position and tyre count', async () => {
    const base = { id: 1, name: 'เส้น', factor: 1 };
    const pack = { id: 32, name: 'มัด 3 เส้น', factor: 3 };
    await store.addToCart('U', 7, 7);
    await store.addToCart('U', 8, 1);
    await store.changeCartUnit('U', 7, null, pack);
    expect(await store.getCart('U')).toEqual([
      { productId: 7, qty: 6, unitId: 32, unitQty: 2, unitName: 'มัด 3 เส้น' },
      { productId: 8, qty: 1 },
    ]);
    await store.changeCartUnit('U', 7, 32, base);
    expect((await store.getCart('U'))[0]).toEqual({ productId: 7, qty: 6 });
  });

  it('rounds small base quantities up to one pack and merges into an existing pack line', async () => {
    const pack = { id: 32, name: 'มัด 3 เส้น', factor: 3 };
    await store.addToCart('U', 7, 3, pack, 1);
    await store.addToCart('U', 7, 1);
    await store.changeCartUnit('U', 7, null, pack);
    expect(await store.getCart('U')).toEqual([{ productId: 7, qty: 6, unitId: 32, unitQty: 2, unitName: 'มัด 3 เส้น' }]);
    await store.changeCartUnit('U', 7, 32, pack);
    expect(await store.getCart('U')).toHaveLength(1);
  });

  it('restores a removed line at its old position, once', async () => {
    await store.addToCart('U', 1, 4);
    await store.addToCart('U', 3, 2);
    const pack = { productId: 2, qty: 6, unitId: 32, unitQty: 2, unitName: 'มัด 3 เส้น' };
    await store.restoreCartLine('U', pack, 1);
    await store.restoreCartLine('U', pack, 1);
    expect((await store.getCart('U')).map((l) => l.productId)).toEqual([1, 2, 3]);
    await store.restoreCartLine('U', { productId: 9, qty: 1 }, 99);
    expect((await store.getCart('U')).at(-1)).toEqual({ productId: 9, qty: 1 });
  });

  it('adds, merges and removes lines per session', async () => {
    await store.addToCart('A', 1, 4);
    await store.addToCart('A', 1, 2);
    await store.addToCart('A', 2, 1);
    await store.addToCart('B', 9, 1);
    expect(await store.getCart('A')).toEqual([{ productId: 1, qty: 6 }, { productId: 2, qty: 1 }]);
    expect(await store.getCart('B')).toEqual([{ productId: 9, qty: 1 }]);
    await store.setCart('A', [{ productId: 1, qty: 0 }, { productId: 2, qty: 3 }]);
    expect(await store.getCart('A')).toEqual([{ productId: 2, qty: 3 }]);
  });

  it('keeps the coupon code with the cart and drops it on checkout', async () => {
    await store.setCartCoupon('A', 'SAVE10');
    expect(await store.getCartCoupon('A')).toBe('SAVE10');
    await placeOrder();
    expect(await store.getCartCoupon('A')).toBeNull();
  });
});

describe('orders', () => {
  it('creates an order, clears the cart and scopes by session', async () => {
    const order = await placeOrder();
    expect(order.ref).toMatch(/^WEB-\d{8}-001$/);
    expect(order.status).toBe('PENDING');
    expect(order.total).toBe(9600);
    expect(await store.getCart('A')).toEqual([]);
    expect(await store.listOrders('A')).toHaveLength(1);
    expect(await store.listOrders('B')).toHaveLength(0);
    expect(await store.getOrder('B', order.id)).toBeUndefined();
  });

  it('refuses a second order from the same (now empty) cart', async () => {
    await placeOrder();
    await expect(store.createOrder(orderInput())).rejects.toBeInstanceOf(store.CartEmptyError);
    expect(await store.listOrders('A')).toHaveLength(1);
  });

  it('advances through the status flow and keeps the given tracking number', async () => {
    const order = await placeOrder();
    expect((await store.advanceOrder('A', order.id))?.status).toBe('PREPARING');
    const shipped = await store.advanceOrder('A', order.id, ' TH123 ');
    expect(shipped?.status).toBe('SHIPPED');
    expect(shipped?.trackingRef).toBe('TH123');
    await store.advanceOrder('A', order.id);
    const final = await store.advanceOrder('A', order.id);
    expect(final?.status).toBe('PAID');
    expect(final?.events.map((e) => e.status)).toEqual(['PENDING', 'PREPARING', 'SHIPPED', 'INVOICED', 'PAID']);
  });

  it('does not advance when the status is no longer the expected one (double click)', async () => {
    const order = await placeOrder();
    await store.advanceOrder(null, order.id, undefined, 'PENDING');
    const again = await store.advanceOrder(null, order.id, undefined, 'PENDING');
    expect(again?.status).toBe('PREPARING');
  });

  it('attaches and verifies a slip only while pending', async () => {
    const order = await placeOrder();
    expect(order.payment).toEqual({ slipFile: null, slipUploadedAt: null, verifiedAt: null });
    expect((await store.verifySlip(order.id))?.payment.verifiedAt).toBeNull();
    const withSlip = await store.attachSlip('A', order.id, 'abc-1.jpg');
    expect(withSlip?.payment.slipFile).toBe('abc-1.jpg');
    expect((await store.verifySlip(order.id))?.payment.verifiedAt).toBeTruthy();
    await store.attachSlip('A', order.id, 'abc-2.jpg');
    expect((await store.getOrder('A', order.id))?.payment.verifiedAt).toBeNull();
    await store.advanceOrder('A', order.id);
    expect((await store.attachSlip('A', order.id, 'abc-3.jpg'))?.payment.slipFile).toBe('abc-2.jpg');
    expect(await store.attachSlip('B', order.id, 'x-1.jpg')).toBeUndefined();
  });

  it('credit orders need no slip; cash orders need a verified one', async () => {
    const credit = await placeOrder({ ...orderInput(), paymentMethod: 'CREDIT' as never });
    expect(store.isPaymentReady(credit)).toBe(true);
    expect((await store.attachSlip('A', credit.id, 'abc-1.jpg'))?.payment.slipFile).toBeNull();
    const cash = await placeOrder();
    expect(store.isPaymentReady(cash)).toBe(false);
    await store.attachSlip('A', cash.id, 'abc-2.jpg');
    expect(store.isPaymentReady((await store.verifySlip(cash.id))!)).toBe(true);
  });

  it('only cancels pending orders', async () => {
    const order = await placeOrder();
    await store.advanceOrder('A', order.id);
    expect((await store.cancelOrder('A', order.id))?.status).toBe('PREPARING');
    const second = await placeOrder();
    expect((await store.cancelOrder('A', second.id))?.status).toBe('CANCELLED');
    expect((await store.advanceOrder('A', second.id))?.status).toBe('CANCELLED');
  });

  it('counts stale pending orders and records the Odoo sync result', async () => {
    const order = await placeOrder();
    expect(await store.countStalePending(60_000, Date.now() + 120_000)).toBe(1);
    expect(await store.countStalePending(60_000)).toBe(0);
    const synced = await store.setOdooSync(order.id, { status: 'SYNCED', saleOrderId: 5, saleOrderName: 'S00005', amountTotal: 9600, error: null, at: new Date().toISOString() });
    expect(synced?.odoo?.saleOrderName).toBe('S00005');
  });
});

describe('listOpenCreditOrders', () => {
  it('returns credit orders that are not paid or cancelled, optionally for one dealer', async () => {
    const credit = (sessionId: string) => ({ ...orderInput(), sessionId, paymentMethod: 'CREDIT' as const });
    const own = await placeOrder(credit('dealer:d1'));
    await placeOrder(credit('staff:u1:42'));
    await placeOrder(credit('staff:u1:420'));
    await placeOrder(credit('dealer:d2'));
    await placeOrder({ ...orderInput(), sessionId: 'dealer:d1' });
    const cancelled = await placeOrder(credit('dealer:d1'));
    await store.cancelOrder(null, cancelled.id);

    expect(await store.listOpenCreditOrders()).toHaveLength(4);
    const mine = await store.listOpenCreditOrders({ id: 'd1', odooPartnerId: 42 });
    expect(mine.map((o) => o.scope).sort()).toEqual(['dealer:d1', 'staff:u1:42']);
    expect(mine[0].total).toBe(own.total);
    expect(await store.listOpenCreditOrders({ id: 'd1', odooPartnerId: null })).toHaveLength(1);
  });
});
