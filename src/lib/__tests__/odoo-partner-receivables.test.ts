import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn(), odooRead: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { readOpenInvoices } = await import('@/lib/odoo/partner-receivables');
const { getPartnerCredit } = await import('@/lib/shop/catalog');

beforeEach(() => rpc.odooSearchRead.mockReset());

describe('readOpenInvoices', () => {
  it('reads posted unpaid invoices and credit notes of the partner and its contacts', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([
      { id: 1, name: 'INV/2026/0001', move_type: 'out_invoice', amount_residual: 1500, invoice_date_due: '2026-10-01', invoice_origin: 'S00012' },
      { id: 2, name: 'RINV/2026/0001', move_type: 'out_refund', amount_residual: 200, invoice_date_due: false, invoice_origin: false },
    ]);
    expect(await readOpenInvoices(42)).toEqual([
      { id: 1, name: 'INV/2026/0001', refund: false, residual: 1500, dueDate: '2026-10-01', origin: 'S00012' },
      { id: 2, name: 'RINV/2026/0001', refund: true, residual: -200, dueDate: null, origin: null },
    ]);
    const [model, domain] = rpc.odooSearchRead.mock.calls[0];
    expect(model).toBe('account.move');
    expect(domain).toContainEqual(['partner_id', 'child_of', 42]);
    expect(domain).toContainEqual(['state', '=', 'posted']);
  });
});

describe('getPartnerCredit', () => {
  it('reads the commercial partner when the dealer is linked to a contact person', async () => {
    rpc.odooSearchRead
      .mockResolvedValueOnce([{ id: 7, credit: 0, credit_limit: 0, commercial_partner_id: [42, 'ร้านยาง'] }])
      .mockResolvedValueOnce([{ id: 42, credit: 35_000, credit_limit: 100_000, commercial_partner_id: [42, 'ร้านยาง'] }]);
    expect(await getPartnerCredit(7)).toEqual({ limit: 100_000, used: 35_000, commercialId: 42 });
  });
  it('reads once for a company partner', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 42, credit: -50, credit_limit: 0, commercial_partner_id: [42, 'ร้านยาง'] }]);
    expect(await getPartnerCredit(42)).toEqual({ limit: null, used: 0, commercialId: 42 });
    expect(rpc.odooSearchRead).toHaveBeenCalledTimes(1);
  });
});
