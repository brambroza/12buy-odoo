import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dealer } from '@/lib/db/types';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn() }));
const repo = vi.hoisted(() => ({ updateDealer: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);
vi.mock('@/lib/dealers/repo', () => repo);
vi.mock('@/lib/shop/catalog', () => ({ clearPartnerCache: vi.fn() }));

const { ensureDealerPartner, odooStateName, partnerValues } = await import('@/lib/odoo/dealer-partner');

function dealer(overrides: Partial<Dealer> = {}): Dealer {
  return {
    id: 'd1', name: 'โก อะลอง จำกัด', province: 'สมุทรปราการ', phone: '0812345678', taxId: null, address: null, odooPartnerId: null,
    shippingAddress: { line: '288', subdistrict: 'ในคลองบางปลากด', district: 'พระสมุทรเจดีย์', province: 'สมุทรปราการ', postalCode: '10290' },
    ...overrides,
  } as Dealer;
}

describe('partner values', () => {
  it('maps Bangkok without the จังหวัด prefix', () => {
    expect(odooStateName('กรุงเทพมหานคร')).toBe('กรุงเทพมหานคร');
    expect(odooStateName('สมุทรปราการ')).toBe('จังหวัดสมุทรปราการ');
  });

  it('builds a company customer with address, state, country and pricelist', () => {
    expect(partnerValues(dealer(), { stateId: 1524, countryId: 217, pricelistId: 9 })).toMatchObject({
      name: 'โก อะลอง จำกัด', is_company: true, customer_rank: 1, phone: '0812345678', vat: false,
      street: '288', street2: 'ในคลองบางปลากด พระสมุทรเจดีย์', zip: '10290', state_id: 1524, country_id: 217, property_product_pricelist: 9,
    });
  });

  it('omits lookups that were not found', () => {
    const values = partnerValues(dealer({ shippingAddress: null, address: '1 ถ.ตัวอย่าง' }), { stateId: null, countryId: null, pricelistId: null });
    expect(values.street).toBe('1 ถ.ตัวอย่าง');
    expect(values).not.toHaveProperty('state_id');
    expect(values).not.toHaveProperty('property_product_pricelist');
  });
});

describe('ensureDealerPartner', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.resetAllMocks());

  it('returns the linked partner without calling Odoo', async () => {
    expect(await ensureDealerPartner(dealer({ odooPartnerId: 55 }), 9)).toBe(55);
    expect(rpc.odooSearchRead).not.toHaveBeenCalled();
  });

  it('links a single existing partner with the same name instead of creating one', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 42, name: 'โก อะลอง จำกัด' }]);
    expect(await ensureDealerPartner(dealer(), 9)).toBe(42);
    expect(rpc.odooWrite).not.toHaveBeenCalled();
    expect(repo.updateDealer).toHaveBeenCalledWith('d1', { odooPartnerId: 42 });
  });

  it('searches by tax id when the dealer has one', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 42, name: 'x' }]);
    await ensureDealerPartner(dealer({ taxId: '0105555000000' }), 9);
    expect(rpc.odooSearchRead.mock.calls[0][1]).toContainEqual(['vat', '=', '0105555000000']);
  });

  it('refuses to guess between several matching partners', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 1, name: 'a' }, { id: 2, name: 'a' }]);
    await expect(ensureDealerPartner(dealer(), 9)).rejects.toThrow('ชื่อซ้ำ 2 ราย');
    expect(rpc.odooWrite).not.toHaveBeenCalled();
    expect(repo.updateDealer).not.toHaveBeenCalled();
  });

  it('creates a new partner and saves its id when none matches', async () => {
    rpc.odooSearchRead
      .mockResolvedValueOnce([]) // no match
      .mockResolvedValueOnce([{ id: 217, name: 'Thailand' }])
      .mockResolvedValueOnce([{ id: 1524, name: 'จังหวัดสมุทรปราการ' }]);
    rpc.odooWrite.mockResolvedValueOnce(901);
    expect(await ensureDealerPartner(dealer(), 9)).toBe(901);
    expect(rpc.odooWrite.mock.calls[0][2][0][0]).toMatchObject({ state_id: 1524, country_id: 217, property_product_pricelist: 9 });
    expect(repo.updateDealer).toHaveBeenCalledWith('d1', { odooPartnerId: 901 });
  });
});
