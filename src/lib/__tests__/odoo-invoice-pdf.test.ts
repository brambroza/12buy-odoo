import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooRead: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);
const { fetchInvoicePdf } = await import('@/lib/odoo/invoice-pdf');

describe('fetchInvoicePdf', () => {
  beforeEach(() => vi.resetAllMocks());

  it('refuses invoices of another partner', async () => {
    rpc.odooSearchRead.mockResolvedValueOnce([{ id: 5, name: 'INV/1', partner_id: [9, 'x'], commercial_partner_id: [9, 'x'], move_type: 'out_invoice', state: 'posted' }]);
    await expect(fetchInvoicePdf(5, [40])).resolves.toEqual({ ok: false, reason: 'forbidden' });
    expect(rpc.odooRead).not.toHaveBeenCalled();
  });

  it('accepts the company partner and returns the newest PDF attachment', async () => {
    rpc.odooSearchRead
      .mockResolvedValueOnce([{ id: 5, name: 'INV/1', partner_id: [41, 'contact'], commercial_partner_id: [40, 'company'], move_type: 'out_invoice', state: 'posted' }])
      .mockResolvedValueOnce([{ id: 77, name: 'INV_1.pdf', mimetype: 'application/pdf', create_date: '2026-10-30 01:00:00' }]);
    rpc.odooRead.mockResolvedValueOnce([{ id: 77, datas: Buffer.from('%PDF-1.4').toString('base64') }]);
    const result = await fetchInvoicePdf(5, [40]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe('INV_1.pdf');
      expect(result.bytes.toString()).toBe('%PDF-1.4');
    }
    expect(rpc.odooSearchRead.mock.calls[1][0]).toBe('ir.attachment');
  });

  it('reports when accounting has not printed the invoice yet', async () => {
    rpc.odooSearchRead
      .mockResolvedValueOnce([{ id: 5, name: 'INV/1', partner_id: [40, 'c'], commercial_partner_id: [40, 'c'], move_type: 'out_invoice', state: 'posted' }])
      .mockResolvedValueOnce([]);
    await expect(fetchInvoicePdf(5, [40])).resolves.toEqual({ ok: false, reason: 'no-pdf' });
  });
});
