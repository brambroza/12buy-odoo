import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooRead: vi.fn(), odooSearchRead: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { findClaimablePartner, normalizeTaxId, partnerAddress, phoneKey, phoneMatches, resetPartnerFieldCache } = await import('@/lib/odoo/partner-claim');

const TAX = '0105556123456';

function partner(overrides: Record<string, unknown> = {}) {
  return { id: 7, name: 'ร้านยางสมชาย', vat: TAX, phone: '02-123-4567', street: '1 ถ.สุขุมวิท', street2: false, city: 'บางนา', zip: '10260', state_id: [1, 'กรุงเทพมหานคร'], ...overrides };
}

describe('normalizers', () => {
  it('accepts 13-digit tax ids with TH prefix, dashes or spaces', () => {
    expect(normalizeTaxId('TH0105556123456')).toBe(TAX);
    expect(normalizeTaxId('0-1055-56123-45-6')).toBe(TAX);
    expect(normalizeTaxId('010555612345')).toBeNull();
    expect(normalizeTaxId('')).toBeNull();
  });

  it('compares phones on the last 9 digits', () => {
    expect(phoneKey('+66 2 123 4567')).toBe(phoneKey('021234567'));
    expect(phoneKey('081-234-5678')).toBe('812345678');
    expect(phoneKey('1234')).toBeNull();
    expect(phoneKey(false)).toBeNull();
  });

  it('matches phone or mobile', () => {
    expect(phoneMatches({ phone: false, mobile: '0812345678' }, '+66812345678')).toBe(true);
    expect(phoneMatches({ phone: '021234567', mobile: false }, '0812345678')).toBe(false);
    expect(phoneMatches({ phone: false, mobile: false }, '0812345678')).toBe(false);
  });

  it('joins the address parts', () => {
    expect(partnerAddress(partner() as never)).toBe('1 ถ.สุขุมวิท บางนา 10260');
    expect(partnerAddress(partner({ street: false, city: false, zip: false }) as never)).toBeNull();
  });
});

describe('findClaimablePartner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPartnerFieldCache();
    rpc.odooRead.mockResolvedValue({});
  });

  it('returns the single company customer with matching tax id and phone', async () => {
    rpc.odooSearchRead.mockResolvedValue([partner()]);
    expect((await findClaimablePartner(TAX, '021234567'))?.id).toBe(7);
    const [model, domain, fields] = rpc.odooSearchRead.mock.calls[0];
    expect(model).toBe('res.partner');
    expect(domain).toEqual([['vat', 'ilike', TAX], ['parent_id', '=', false], ['customer_rank', '>', 0]]);
    expect(fields).not.toContain('mobile');
  });

  it('reads mobile when the Odoo version still has it', async () => {
    rpc.odooRead.mockResolvedValue({ mobile: { type: 'char' } });
    rpc.odooSearchRead.mockResolvedValue([partner({ phone: false, mobile: '0812345678' })]);
    expect((await findClaimablePartner(TAX, '0812345678'))?.id).toBe(7);
    expect(rpc.odooSearchRead.mock.calls[0][2]).toContain('mobile');
  });

  it('refuses a wrong phone', async () => {
    rpc.odooSearchRead.mockResolvedValue([partner()]);
    expect(await findClaimablePartner(TAX, '0899999999')).toBeNull();
  });

  it('ignores partners whose tax id only contains the digits', async () => {
    rpc.odooSearchRead.mockResolvedValue([partner({ vat: `9${TAX}` })]);
    expect(await findClaimablePartner(TAX, '021234567')).toBeNull();
  });

  it('refuses to guess between several matches', async () => {
    rpc.odooSearchRead.mockResolvedValue([partner(), partner({ id: 8 })]);
    expect(await findClaimablePartner(TAX, '021234567')).toBeNull();
  });
});
