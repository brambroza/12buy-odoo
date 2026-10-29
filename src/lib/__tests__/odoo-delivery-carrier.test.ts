import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { pickDealerCarrier, createCarrier, deliveryProducts, listAllCarriers, listPublishedCarriers, setCarrierActive, updateCarrier } = await import('@/lib/odoo/delivery-carrier');

const carrier = (id: number, extra: Partial<{ name: string; published: boolean; productId: number | null; productName: string }> = {}) => ({
  id, name: extra.name ?? `C${id}`, sequence: 10, active: true, published: extra.published ?? true,
  productId: extra.productId === undefined ? 9 : extra.productId, productName: extra.productName ?? 'ค่าขนส่ง',
});

describe('delivery carrier reads', () => {
  beforeEach(() => vi.resetAllMocks());

  it('maps Odoo rows and lists archived ones only for the admin', async () => {
    rpc.odooSearchRead.mockResolvedValue([{ id: 1, name: 'รถบริษัท', sequence: 1, active: true, is_published: true, product_id: [988, 'ค่าขนส่งสินค้า'] }]);
    expect(await listAllCarriers()).toEqual([{ id: 1, name: 'รถบริษัท', sequence: 1, active: true, published: true, productId: 988, productName: 'ค่าขนส่งสินค้า' }]);
    expect(rpc.odooSearchRead.mock.calls[0][3]).toMatchObject({ context: { active_test: false } });
    await listPublishedCarriers();
    expect(rpc.odooSearchRead.mock.calls[1][1]).toEqual([['is_published', '=', true]]);
    expect(rpc.odooSearchRead.mock.calls[1][3]).not.toHaveProperty('context');
  });
});

describe('pickDealerCarrier', () => {
  it('uses the method assigned to the customer (published or not), else the first published one', () => {
    const published = [carrier(1), carrier(2)];
    expect(pickDealerCarrier(carrier(7, { published: false }), published)).toEqual({ carrier: carrier(7, { published: false }), assigned: true });
    expect(pickDealerCarrier(null, published)).toEqual({ carrier: carrier(1), assigned: false });
    expect(pickDealerCarrier({ ...carrier(7), active: false }, published)?.carrier.id).toBe(1);
    expect(pickDealerCarrier(null, [])).toBeNull();
  });
});

describe('deliveryProducts', () => {
  it('lists delivery products by how many methods use them', () => {
    const list = deliveryProducts([carrier(1, { productId: 988, productName: 'A' }), carrier(2, { productId: 987, productName: 'B' }), carrier(3, { productId: 987, productName: 'B' }), carrier(4, { productId: null })]);
    expect(list).toEqual([{ id: 987, name: 'B', count: 2 }, { id: 988, name: 'A', count: 1 }]);
  });
});

describe('delivery carrier writes', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a free fixed-price method', async () => {
    rpc.odooWrite.mockResolvedValueOnce(500);
    expect(await createCarrier({ name: 'ขนส่งใหม่', sequence: 5, published: true, productId: 987 })).toBe(500);
    expect(rpc.odooWrite).toHaveBeenCalledWith('delivery.carrier', 'create', [[{ name: 'ขนส่งใหม่', sequence: 5, is_published: true, delivery_type: 'fixed', fixed_price: 0, product_id: 987 }]]);
  });

  it('writes only the fields given, and unpublishes when archiving', async () => {
    rpc.odooWrite.mockResolvedValue(true);
    await updateCarrier(3, { published: false });
    expect(rpc.odooWrite).toHaveBeenLastCalledWith('delivery.carrier', 'write', [[3], { is_published: false }]);
    await setCarrierActive(3, false);
    expect(rpc.odooWrite).toHaveBeenLastCalledWith('delivery.carrier', 'write', [[3], { active: false, is_published: false }]);
    await setCarrierActive(3, true);
    expect(rpc.odooWrite).toHaveBeenLastCalledWith('delivery.carrier', 'write', [[3], { active: true }]);
  });
});
