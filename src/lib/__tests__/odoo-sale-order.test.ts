import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProtoOrder } from '@/lib/shop/types';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn(), odooRead: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { buildOrderLines, buildOrderNote, carrierIdFor, pushOrderToOdoo, salespersonFor, totalsMatch } = await import('@/lib/odoo/sale-order');

/** WEB-20261028-007 as stored by the shop. */
function sampleOrder(overrides: Partial<ProtoOrder> = {}): ProtoOrder {
  return {
    id: 'mvrr7a827', ref: 'WEB-20261028-007', sessionId: 'dealer:d1', dealerName: 'โก อะลอง จำกัด', status: 'PREPARING',
    lines: [
      { productId: 510, name: 'ยาง 60/90-17', code: 'MC0418', size: '60/90-17', qty: 20, unitPrice: 187.61, cashDiscountPerUnit: 0, unitId: 31, unitName: 'มัด 10 เส้น', unitQty: 2 },
      { productId: 534, name: 'ยางใน 2.25-17', code: 'EN0502', size: '2.25-17', qty: 2, unitPrice: 39, cashDiscountPerUnit: 0, unitId: null, unitName: null, unitQty: null },
      { productId: 533, name: 'ยางใน 2.00-17', code: 'EN0501', size: '2.00-17', qty: 60, unitPrice: 36, cashDiscountPerUnit: 0, unitId: 35, unitName: 'กระสอบ 60', unitQty: 1 },
    ],
    paymentMethod: 'CASH', subtotal: 5990.2, cashDiscount: 0, couponDiscount: 0, total: 5990.2,
    address: '288 ตำบลในคลองบางปลากด', carrier: 'รถบริษัท', carrierId: 1, note: '', trackingRef: null,
    payment: { slipFile: 's.png', slipUploadedAt: '2026-10-28T07:13:23Z', verifiedAt: '2026-10-28T07:15:02Z' },
    createdAt: '2026-10-28T06:48:58Z', events: [],
    ...overrides,
  };
}

describe('buildOrderLines', () => {
  it('sends pack lines in the pack unit with the pack price and loose lines in base units', () => {
    expect(buildOrderLines(sampleOrder())).toEqual([
      { product_id: 510, product_uom_qty: 2, product_uom_id: 31, price_unit: 1876.1 },
      { product_id: 534, product_uom_qty: 2, price_unit: 39 },
      { product_id: 533, product_uom_qty: 1, product_uom_id: 35, price_unit: 2160 },
    ]);
  });

  it('keeps the order total: sum of qty × price equals the web total', () => {
    const sum = buildOrderLines(sampleOrder()).reduce((acc, l) => acc + (l.product_uom_qty as number) * (l.price_unit as number), 0);
    expect(totalsMatch(sum, 5990.2)).toBe(true);
  });

  it('folds the cash discount into the unit price only for cash payment', () => {
    const line = { productId: 1, name: 'x', code: 'x', size: null, qty: 4, unitPrice: 1000, cashDiscountPerUnit: 30 };
    expect(buildOrderLines({ lines: [line], paymentMethod: 'CASH' })[0].price_unit).toBe(970);
    expect(buildOrderLines({ lines: [line], paymentMethod: 'CREDIT' })[0].price_unit).toBe(1000);
  });

  it('falls back to base units when the quantity is not a whole number of packs', () => {
    const line = { productId: 1, name: 'x', code: 'x', size: null, qty: 23, unitPrice: 10, unitId: 31, unitQty: 2 };
    expect(buildOrderLines({ lines: [line], paymentMethod: 'CASH' })[0]).toEqual({ product_id: 1, product_uom_qty: 23, price_unit: 10 });
  });
});

describe('cash discount as end-of-bill lines', () => {
  const discount = { productId: 999, taxField: 'tax_ids' };
  const lines = [
    { productId: 1, name: 'a', code: 'a', size: null, qty: 4, unitPrice: 1000, cashDiscountPerUnit: 20, cashDiscountPercent: 2, taxIds: [5] },
    { productId: 2, name: 'b', code: 'b', size: null, qty: 2, unitPrice: 500, cashDiscountPerUnit: 10, cashDiscountPercent: 2, taxIds: [5] },
    { productId: 3, name: 'c', code: 'c', size: null, qty: 1, unitPrice: 300, cashDiscountPerUnit: 9, cashDiscountPercent: 3, taxIds: [6] },
  ];

  it('sends full prices plus one negative line per tax set', () => {
    const out = buildOrderLines({ lines, paymentMethod: 'CASH', ref: 'WEB-1' }, discount);
    expect(out.slice(0, 3).map((l) => l.price_unit)).toEqual([1000, 500, 300]);
    expect(out.slice(3)).toEqual([
      { product_id: 999, name: 'ส่วนลดเงินสด 2% (ออเดอร์เว็บ WEB-1)', product_uom_qty: 1, price_unit: -100, tax_ids: [[6, 0, [5]]] },
      { product_id: 999, name: 'ส่วนลดเงินสด 3% (ออเดอร์เว็บ WEB-1)', product_uom_qty: 1, price_unit: -9, tax_ids: [[6, 0, [6]]] },
    ]);
    const sum = out.reduce((acc, l) => acc + (l.product_uom_qty as number) * (l.price_unit as number), 0);
    expect(sum).toBe(5300 - 109);
  });

  it('adds no discount line on credit', () => {
    expect(buildOrderLines({ lines, paymentMethod: 'CREDIT', ref: 'WEB-1' }, discount)).toHaveLength(3);
  });

  it('folds the discount into prices when a discounted line has no stored taxes (older orders)', () => {
    const old = [{ ...lines[0], taxIds: undefined }];
    expect(buildOrderLines({ lines: old, paymentMethod: 'CASH', ref: 'WEB-1' }, discount)).toEqual([{ product_id: 1, product_uom_qty: 4, price_unit: 980 }]);
  });

  it('says so in the note', () => {
    expect(buildOrderNote(sampleOrder({ cashDiscount: 109 }), true)).toContain('ส่วนลดเงินสด 109.00 บาท เป็นบรรทัดท้ายบิล');
  });
});

describe('buildOrderNote', () => {
  it('lists ref, payment, carrier, address and the dealer remark', () => {
    const note = buildOrderNote(sampleOrder({ note: 'ส่งช่วงเช้า', cashDiscount: 12.5 }));
    expect(note).toContain('WEB-20261028-007');
    expect(note).toContain('รวมส่วนลดเงินสด 12.50 บาท');
    expect(note).toContain('การจัดส่ง: รถบริษัท');
    expect(note).toContain('หมายเหตุ: ส่งช่วงเช้า');
    expect(note).not.toContain('เลขที่ใบสั่งซื้อ');
  });

  it('includes the dealer PO number when given', () => {
    expect(buildOrderNote(sampleOrder({ poRef: 'PO-6811-023' }))).toContain('เลขที่ใบสั่งซื้อของร้าน: PO-6811-023');
  });
});

describe('pushOrderToOdoo', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.resetAllMocks());

  it('creates and confirms a new SO, then marks it SYNCED when totals match', async () => {
    rpc.odooSearchRead
      .mockResolvedValueOnce([]) // no SO with this ref yet
      .mockResolvedValueOnce([{ id: 900, user_id: [12, 'เซลล์สมชาย'], commercial_partner_id: [900, 'ร้าน'] }])
      .mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'draft', amount_total: 5990.2 }])
      .mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'sale', amount_total: 5990.2 }]);
    rpc.odooWrite.mockResolvedValueOnce(77).mockResolvedValueOnce(true);

    const result = await pushOrderToOdoo(sampleOrder(), 900);

    const [, , createArgs] = rpc.odooWrite.mock.calls[0];
    expect(rpc.odooWrite.mock.calls[0].slice(0, 2)).toEqual(['sale.order', 'create']);
    expect(createArgs[0][0]).toMatchObject({ partner_id: 900, user_id: 12, client_order_ref: 'WEB-20261028-007', origin: 'Web', carrier_id: 1 });
    expect(createArgs[0][0].order_line).toHaveLength(3);
    expect(rpc.odooWrite.mock.calls[1]).toEqual(['sale.order', 'action_confirm', [[77]]]);
    expect(result).toMatchObject({ status: 'SYNCED', saleOrderId: 77, saleOrderName: 'S00077', amountTotal: 5990.2 });
  });

  it('reuses an already confirmed SO with the same ref instead of creating a duplicate', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'sale', amount_total: 5990.2 }]);
    const result = await pushOrderToOdoo(sampleOrder(), 900);
    expect(rpc.odooWrite).not.toHaveBeenCalled();
    expect(result.status).toBe('SYNCED');
  });

  it('applies the coupon through the Odoo wizard before confirming, and sets the book pricelist', async () => {
    const coupon = { code: 'TIRE500', programId: 9, programName: 'ลด 500', label: 'ลด ฿500', discount: 500 };
    rpc.odooSearchRead
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 900, user_id: false, commercial_partner_id: [900, 'ร้าน'] }])
      .mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'draft', amount_total: 5990.2 }])
      .mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'sale', amount_total: 5490.2 }]);
    rpc.odooRead.mockResolvedValueOnce(0); // no reward line yet
    rpc.odooWrite.mockResolvedValueOnce(77).mockResolvedValueOnce(5).mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    const result = await pushOrderToOdoo(sampleOrder({ coupon, couponDiscount: 500, total: 5490.2, odooPricelistId: 42 }), 900);

    expect(rpc.odooWrite.mock.calls[0][2][0][0]).toMatchObject({ pricelist_id: 42, user_id: false });
    expect(rpc.odooWrite.mock.calls[1]).toEqual(['sale.loyalty.coupon.wizard', 'create', [[{ order_id: 77, coupon_code: 'TIRE500' }]]]);
    expect(rpc.odooWrite.mock.calls[2]).toEqual(['sale.loyalty.coupon.wizard', 'action_apply', [[5]]]);
    expect(rpc.odooWrite.mock.calls[3]).toEqual(['sale.order', 'action_confirm', [[77]]]);
    expect(result.status).toBe('SYNCED');
  });

  it('does not apply the coupon twice when retrying a draft SO that already has the reward line', async () => {
    const coupon = { code: 'TIRE500', programId: 9, programName: 'ลด 500', label: 'ลด ฿500', discount: 500 };
    rpc.odooSearchRead
      .mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'draft', amount_total: 5490.2 }])
      .mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'sale', amount_total: 5490.2 }]);
    rpc.odooRead.mockResolvedValueOnce(1);
    rpc.odooWrite.mockResolvedValueOnce(true);
    await pushOrderToOdoo(sampleOrder({ coupon, couponDiscount: 500, total: 5490.2 }), 900);
    expect(rpc.odooWrite.mock.calls).toEqual([['sale.order', 'action_confirm', [[77]]]]);
  });

  it('fails (SO stays draft) when Odoo asks to pick between rewards', async () => {
    const coupon = { code: 'MULTI', programId: 9, programName: 'x', label: 'x', discount: 10 };
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'draft', amount_total: 5990.2 }]);
    rpc.odooRead.mockResolvedValueOnce(0);
    rpc.odooWrite.mockResolvedValueOnce([5]).mockResolvedValueOnce({ type: 'ir.actions.act_window', res_model: 'sale.loyalty.reward.wizard' });
    await expect(pushOrderToOdoo(sampleOrder({ coupon, couponDiscount: 10 }), 900)).rejects.toThrow('รางวัลให้เลือกหลายแบบ');
    expect(rpc.odooWrite).not.toHaveBeenCalledWith('sale.order', 'action_confirm', expect.anything());
  });

  it('flags MISMATCH when the Odoo total differs from the web total', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 77, name: 'S00077', state: 'sale', amount_total: 6409.51 }]);
    expect((await pushOrderToOdoo(sampleOrder(), 900)).status).toBe('MISMATCH');
  });
});

describe('carrierIdFor', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses the stored delivery method id without asking Odoo', async () => {
    expect(await carrierIdFor({ carrier: 'รถบริษัท', carrierId: 5 })).toBe(5);
    expect(rpc.odooSearchRead).not.toHaveBeenCalled();
  });

  it('looks older orders up by name, and sends none when the name is gone', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 437, name: 'เก็บค่าขนส่งปลายทาง', sequence: 10, active: true, is_published: true, product_id: [9, 'ค่าขนส่ง'] }]);
    expect(await carrierIdFor({ carrier: 'เก็บค่าขนส่งปลายทาง', carrierId: null })).toBe(437);
    expect(rpc.odooSearchRead.mock.calls[0].slice(0, 2)).toEqual(['delivery.carrier', [['name', '=', 'เก็บค่าขนส่งปลายทาง']]]);
    rpc.odooSearchRead.mockResolvedValueOnce([]);
    expect(await carrierIdFor({ carrier: 'ขนส่งที่ถูกลบ' })).toBeNull();
  });
});

describe('salespersonFor', () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses the customer's salesperson, else the company's, else none (never the API user)", async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 5, user_id: [12, 'A'], commercial_partner_id: [5, 'x'] }]);
    expect(await salespersonFor(5)).toBe(12);
    rpc.odooSearchRead
      .mockResolvedValueOnce([{ id: 6, user_id: false, commercial_partner_id: [1, 'บริษัทแม่'] }])
      .mockResolvedValueOnce([{ id: 1, user_id: [14, 'B'], commercial_partner_id: [1, 'บริษัทแม่'] }]);
    expect(await salespersonFor(6)).toBe(14);
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 7, user_id: false, commercial_partner_id: [7, 'x'] }]);
    expect(await salespersonFor(7)).toBe(false);
  });
});
