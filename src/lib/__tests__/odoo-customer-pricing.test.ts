import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { getOdooCustomer, updateOdooCustomerCreditLimit, getOdooPartnerKinds, partnerKind, parseCustomerCarrier, parseCustomerPricingForm, partnerPricingValues, toOdooCustomer, updateOdooCustomerPricing } = await import('@/lib/odoo/customer-pricing');

function raw(overrides: Record<string, unknown> = {}) {
  return {
    id: 129, name: 'กิตติชัยการยาง', vat: '0105556123456', phone: '0812345678', email: false, state_id: [1, 'จังหวัดเชียงใหม่ (TH)'],
    property_product_pricelist: [10, 'ราคา PCR ร้านค้าปลีก (Credit)'], credit_limit: 35000, use_partner_credit_limit: true, credit: 1200.5, user_id: [2, 'เซลล์ A'],
    ...overrides,
  } as Parameters<typeof toOdooCustomer>[0];
}

const PRICELISTS = new Set([9, 10]);

beforeEach(() => {
  rpc.odooSearchRead.mockReset();
  rpc.odooWrite.mockReset();
});

describe('toOdooCustomer', () => {
  it('maps pricelist, province, limit and receivable', () => {
    expect(toOdooCustomer(raw())).toEqual({
      id: 129, name: 'กิตติชัยการยาง', vat: '0105556123456', phone: '0812345678', email: null, province: 'เชียงใหม่',
      pricelist: { id: 10, name: 'ราคา PCR ร้านค้าปลีก (Credit)' }, creditLimit: 35000, receivable: 1200.5, salesperson: 'เซลล์ A', carrier: null,
    });
    expect(toOdooCustomer(raw({ property_delivery_carrier_id: [16, 'ประกายเพชร โลจิสติกส์'] })).carrier).toEqual({ id: 16, name: 'ประกายเพชร โลจิสติกส์' });
  });

  it('treats the limit as off when "Partner Limit" is off or the amount is 0', () => {
    expect(toOdooCustomer(raw({ use_partner_credit_limit: false })).creditLimit).toBeNull();
    expect(toOdooCustomer(raw({ credit_limit: 0 })).creditLimit).toBeNull();
  });

  it('never shows a negative receivable (customer paid in advance)', () => {
    expect(toOdooCustomer(raw({ credit: -500 })).receivable).toBe(0);
  });
});

describe('parseCustomerPricingForm', () => {
  it('accepts a known pricelist and a limit with thousands separators', () => {
    expect(parseCustomerPricingForm({ pricelistId: '10', creditLimit: '50,000.456' }, PRICELISTS)).toEqual({ ok: true, update: { pricelistId: 10, creditLimit: 50000.46 } });
  });

  it('blank or 0 limit means no partner limit', () => {
    expect(parseCustomerPricingForm({ pricelistId: '9', creditLimit: '' }, PRICELISTS)).toEqual({ ok: true, update: { pricelistId: 9, creditLimit: null } });
    expect(parseCustomerPricingForm({ pricelistId: '9', creditLimit: '0' }, PRICELISTS)).toEqual({ ok: true, update: { pricelistId: 9, creditLimit: null } });
  });

  it('rejects unknown pricelists, missing pricelist and bad amounts', () => {
    expect(parseCustomerPricingForm({ pricelistId: '99', creditLimit: '' }, PRICELISTS)).toEqual({ ok: false, error: 'ไม่พบกลุ่มราคานี้ใน Odoo' });
    expect(parseCustomerPricingForm({ pricelistId: '', creditLimit: '' }, PRICELISTS).ok).toBe(false);
    expect(parseCustomerPricingForm({ pricelistId: '9', creditLimit: '-1' }, PRICELISTS).ok).toBe(false);
    expect(parseCustomerPricingForm({ pricelistId: '9', creditLimit: 'abc' }, PRICELISTS).ok).toBe(false);
  });
});

describe('Odoo writes', () => {
  it('turns the partner limit on only for a positive limit', () => {
    expect(partnerPricingValues({ pricelistId: 10, creditLimit: 40000 })).toEqual({ property_product_pricelist: 10, use_partner_credit_limit: true, credit_limit: 40000 });
    expect(partnerPricingValues({ pricelistId: 9, creditLimit: null })).toEqual({ property_product_pricelist: 9, use_partner_credit_limit: false, credit_limit: 0 });
    expect(partnerPricingValues({ pricelistId: 9, creditLimit: null, carrierId: 16 })).toMatchObject({ property_delivery_carrier_id: 16 });
    expect(partnerPricingValues({ pricelistId: 9, creditLimit: null, carrierId: null })).toMatchObject({ property_delivery_carrier_id: false });
  });

  it('writes only the pricing fields of that one partner', async () => {
    rpc.odooWrite.mockResolvedValue(true);
    await updateOdooCustomerPricing(129, { pricelistId: 10, creditLimit: 40000 });
    expect(rpc.odooWrite).toHaveBeenCalledWith('res.partner', 'write', [[129], { property_product_pricelist: 10, use_partner_credit_limit: true, credit_limit: 40000 }]);
  });

  it('looks a customer up only among company customers', async () => {
    rpc.odooSearchRead.mockResolvedValue([]);
    expect(await getOdooCustomer(5)).toBeNull();
    expect(rpc.odooSearchRead.mock.calls[0][1]).toEqual([['id', '=', 5], ['parent_id', '=', false], '|', ['customer_rank', '>', 0], ['user_ids.share', '=', true]]);
  });
});

describe('parseCustomerCarrier', () => {
  it('accepts blank (no assigned method) or a listed method, and refuses anything else', () => {
    const ids = new Set([1, 16]);
    expect(parseCustomerCarrier('', ids)).toEqual({ ok: true, carrierId: null });
    expect(parseCustomerCarrier('16', ids)).toEqual({ ok: true, carrierId: 16 });
    expect(parseCustomerCarrier('99', ids).ok).toBe(false);
    expect(parseCustomerCarrier('1.5', ids).ok).toBe(false);
  });
});

describe('partnerKind', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({ id: 5, active: true, customer_rank: 1, parent_id: false, ...overrides }) as Parameters<typeof partnerKind>[0];

  it('tells company customers, contacts, archived and missing partners apart', () => {
    expect(partnerKind(row())).toEqual({ kind: 'customer' });
    expect(partnerKind(row({ customer_rank: 0 }))).toEqual({ kind: 'contact', parent: null });
    expect(partnerKind(row({ parent_id: [9, 'บริษัท ก'] }))).toEqual({ kind: 'contact', parent: { id: 9, name: 'บริษัท ก' } });
    expect(partnerKind(row({ active: false }))).toEqual({ kind: 'archived' });
    expect(partnerKind(undefined)).toEqual({ kind: 'missing' });
  });
});

describe('getOdooPartnerKinds', () => {
  it('reads all ids in one call, including archived, and marks unknown ids missing', async () => {
    rpc.odooSearchRead.mockResolvedValue([{ id: 1, active: true, customer_rank: 2, parent_id: false }]);
    const kinds = await getOdooPartnerKinds([1, 2, 1]);
    expect(rpc.odooSearchRead).toHaveBeenCalledWith('res.partner', [['id', 'in', [1, 2]], ['active', 'in', [true, false]]], ['id', 'active', 'customer_rank', 'parent_id'], { limit: 2 });
    expect(kinds.get(1)).toEqual({ kind: 'customer' });
    expect(kinds.get(2)).toEqual({ kind: 'missing' });
  });

  it('skips Odoo when there is nothing to classify', async () => {
    expect((await getOdooPartnerKinds([])).size).toBe(0);
    expect(rpc.odooSearchRead).not.toHaveBeenCalled();
  });

  it('writes the credit limit alone for the dealer form', async () => {
    rpc.odooWrite.mockResolvedValue(true);
    await updateOdooCustomerCreditLimit(185, 100000);
    await updateOdooCustomerCreditLimit(185, null);
    expect(rpc.odooWrite.mock.calls).toEqual([
      ['res.partner', 'write', [[185], { use_partner_credit_limit: true, credit_limit: 100000 }]],
      ['res.partner', 'write', [[185], { use_partner_credit_limit: false, credit_limit: 0 }]],
    ]);
  });
});
