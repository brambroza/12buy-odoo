import { describe, expect, it } from 'vitest';
import type { OdooReadClient } from '@/lib/odoo/rpc';
import { ISSUE } from '../ledger';
import { fetchCategories, fetchCollections, fetchCredits, fetchOdooUsers, fetchOverdueInvoices, fetchPaidInvoiceIds, fetchPricelists, fetchSales, searchProducts } from '../odoo';

type Row = Record<string, unknown> & { id: number };

/** Evaluates the subset of Odoo domains the module uses (`=`, `in`, `>=`, `<=`, `>`, `ilike`, leading `|` ignored = OR of the next two). */
function matches(row: Row, domain: unknown[]): boolean {
  const terms = domain.filter((t): t is [string, string, unknown] => Array.isArray(t));
  const test = ([field, op, value]: [string, string, unknown]) => {
    const raw = row[field];
    const v = Array.isArray(raw) ? raw[0] : raw; // many2one compares by id
    switch (op) {
      case '=': return v === value;
      case 'in': return (value as unknown[]).includes(v);
      case '>=': return String(v) >= String(value);
      case '<=': return String(v) <= String(value);
      case '<': return String(v) < String(value);
      case '>': return Number(v) > Number(value);
      case 'ilike': return String(v ?? '').toLowerCase().includes(String(value).toLowerCase());
      default: throw new Error(`op ${op}`);
    }
  };
  return domain[0] === '|' ? terms.slice(0, 2).some(test) && terms.slice(2).every(test) : terms.every(test);
}

function fakeClient(data: Record<string, Row[]>): OdooReadClient & { calls: string[] } {
  const calls: string[] = [];
  const pick = (row: Row, fields?: string[]) => (fields ? Object.fromEntries(['id', ...fields].map((f) => [f, row[f] ?? false])) : row);
  const client = {
    calls,
    async read<T>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> {
      calls.push(`${model}.${method}`);
      const rows = data[model] ?? [];
      const fields = kwargs.fields as string[] | undefined;
      if (method === 'read') return (args[0] as number[]).map((id) => rows.find((r) => r.id === id)).filter(Boolean).map((r) => pick(r!, fields)) as T;
      const offset = Number(kwargs.offset ?? 0);
      const limit = Number(kwargs.limit ?? 1e9);
      return rows.filter((r) => matches(r, args[0] as unknown[])).slice(offset, offset + limit).map((r) => pick(r, fields)) as T;
    },
    searchRead<T>(model: string, domain: unknown[], fields: string[], extra: Record<string, unknown> = {}) {
      return client.read<T[]>(model, 'search_read', [domain], { fields, ...extra });
    },
  };
  return client;
}

const base = {
  'account.payment': [
    // Posted straight to the bank: cash date = payment date.
    { id: 1, name: 'PBNK1', date: '2026-10-08', partner_id: [7, 'ร้านยางดี'], move_id: [1001, 'PBNK1'], payment_type: 'inbound', partner_type: 'customer', state: 'paid', is_matched: true },
    // Cheque on an outstanding account, registered before the period, cleared by the bank on 5 Oct.
    { id: 2, name: 'PCHQ2', date: '2026-09-15', partner_id: [7, 'ร้านยางดี'], move_id: [1002, 'PCHQ2'], payment_type: 'inbound', partner_type: 'customer', state: 'paid', is_matched: true },
    // Cheque cleared after the period ends: not counted.
    { id: 3, name: 'PCHQ3', date: '2026-10-15', partner_id: [7, 'ร้านยางดี'], move_id: [1003, 'PCHQ3'], payment_type: 'inbound', partner_type: 'customer', state: 'paid', is_matched: true },
    // Refund to a customer.
    { id: 4, name: 'PREF', date: '2026-10-09', partner_id: [7, 'ร้านยางดี'], move_id: [1004, 'PREF'], payment_type: 'outbound', partner_type: 'customer', state: 'paid', is_matched: true, amount: 300 },
  ],
  'account.bank.statement.line': [
    { id: 9, date: '2026-10-12', payment_ref: 'โอนเข้า', partner_id: [8, 'ร้านล้อสวย'], move_id: [2001, 'BNK/9'], is_reconciled: true, amount: 500 },
  ],
  'account.move.line': [
    { id: 1, move_id: [1001, 'x'], account_type: 'asset_cash', matched_debit_ids: [], matched_credit_ids: [] },
    { id: 2, move_id: [1001, 'x'], account_type: 'asset_receivable', matched_debit_ids: [50], matched_credit_ids: [] },
    { id: 3, move_id: [1002, 'x'], account_type: 'asset_current', matched_debit_ids: [], matched_credit_ids: [60] },
    { id: 4, move_id: [1002, 'x'], account_type: 'asset_receivable', matched_debit_ids: [51], matched_credit_ids: [] },
    { id: 5, move_id: [1003, 'x'], account_type: 'asset_current', matched_debit_ids: [], matched_credit_ids: [61] },
    { id: 6, move_id: [1003, 'x'], account_type: 'asset_receivable', matched_debit_ids: [52], matched_credit_ids: [] },
    { id: 7, move_id: [2001, 'x'], account_type: 'asset_receivable', matched_debit_ids: [53], matched_credit_ids: [] },
    { id: 900, move_id: [100, 'INV1'] }, { id: 901, move_id: [101, 'INV2'] }, { id: 902, move_id: [300, 'MISC'] },
    { id: 11, move_id: [100, 'INV1'], display_type: 'product', product_id: [501, 'Austone PCR'], name: 'a', quantity: 20, price_subtotal: 60_000, price_total: 64_200, sale_line_ids: [71] },
    { id: 12, move_id: [100, 'INV1'], display_type: 'product', product_id: [502, 'Austone TBR'], name: 'b', quantity: 4, price_subtotal: 40_000, price_total: 42_800, sale_line_ids: [72] },
    { id: 13, move_id: [101, 'INV2'], display_type: 'product', product_id: [501, 'Austone PCR'], name: 'c', quantity: 2, price_subtotal: 10_000, price_total: 10_700, sale_line_ids: [] },
    { id: 14, move_id: [102, 'RINV1'], display_type: 'product', product_id: [501, 'Austone PCR'], name: 'd', quantity: 1, price_subtotal: 5_000, price_total: 5_350, sale_line_ids: [] },
  ],
  'account.partial.reconcile': [
    { id: 50, debit_move_id: [900, 'x'], amount: 53_500 },
    { id: 51, debit_move_id: [901, 'x'], amount: 10_700 },
    { id: 52, debit_move_id: [900, 'x'], amount: 1_000 },
    { id: 53, debit_move_id: [902, 'x'], amount: 500 },
    { id: 60, max_date: '2026-10-05' },
    { id: 61, max_date: '2026-10-25' },
  ],
  'account.move': [
    { id: 100, name: 'INV/0001', move_type: 'out_invoice', state: 'posted', invoice_date: '2026-09-01', invoice_date_due: '2026-10-01', amount_total: 107_000, partner_id: [7, 'ร้านยางดี'], commercial_partner_id: [7, 'ร้านยางดี'], invoice_user_id: false },
    { id: 101, name: 'INV/0002', move_type: 'out_invoice', state: 'posted', invoice_date: '2026-09-21', invoice_date_due: '2026-09-21', amount_total: 10_700, partner_id: [7, 'ร้านยางดี'], commercial_partner_id: false, invoice_user_id: [3, 'คนออกบิล'] },
    { id: 102, name: 'RINV/0001', move_type: 'out_refund', state: 'posted', invoice_date: '2026-10-02', invoice_date_due: '2026-10-02', amount_total: 5_350, partner_id: [7, 'ร้านยางดี'], commercial_partner_id: [7, 'ร้านยางดี'], invoice_user_id: false },
    { id: 300, name: 'MISC/1', move_type: 'entry', state: 'posted', invoice_date: false, invoice_date_due: false, amount_total: 500, partner_id: false, commercial_partner_id: false, invoice_user_id: false },
  ],
  'sale.order.line': [{ id: 71, order_id: [30, 'S1'] }, { id: 72, order_id: [30, 'S1'] }],
  'sale.order': [{ id: 30, pricelist_id: [5, 'ราคาปลีก'], user_id: [8, 'สมชาย'] }],
  'res.partner': [{ id: 7, property_product_pricelist: [6, 'ราคาส่ง'], user_id: [9, 'สมหญิง'] }],
  'product.product': [
    { id: 501, categ_id: [1, 'All / AUSTONE-PCR'], display_name: '[A1] Austone PCR', default_code: 'A1', name: 'Austone PCR' },
    { id: 502, categ_id: [2, 'All / AUSTONE-TBR'], display_name: '[A2] Austone TBR', default_code: 'A2', name: 'Austone TBR' },
  ],
  'res.users': [{ id: 8, name: 'สมชาย', login: 's@x', share: false }, { id: 99, name: 'portal', login: 'p@x', share: true }],
  'product.pricelist': [{ id: 5, name: 'ราคาปลีก' }],
  'product.category': [{ id: 1, name: 'AUSTONE-PCR' }, { id: 2, name: 'All / AUSTONE-TBR' }, { id: 3, name: 'AUSTONE-PCR' }],
} satisfies Record<string, Row[]>;

describe('fetchCollections', () => {
  it('counts cash on the day it reached the bank and follows it to invoice lines', async () => {
    const client = fakeClient(base);
    const result = await fetchCollections(client, '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    expect(result.receipts).toBe(3);
    expect(result.refunds).toEqual({ count: 1, amount: 300 });
    const byReceipt = (name: string) => result.lines.filter((l) => l.receiptName === name);

    const p1 = byReceipt('PBNK1');
    expect(p1).toHaveLength(2);
    expect(p1[0]).toMatchObject({ cashDate: '2026-10-08', invoiceName: 'INV/0001', overdueDays: 7, paymentKind: 'CREDIT', odooUserId: 8, ownerFrom: 'order', pricelistId: 5, brand: 'AUSTONE', family: 'PCR', base: 30_000 });

    const cheque = byReceipt('PCHQ2');
    expect(cheque).toHaveLength(1);
    expect(cheque[0]).toMatchObject({ cashDate: '2026-10-05', invoiceName: 'INV/0002', overdueDays: 14, paymentKind: 'CASH', odooUserId: 3, ownerFrom: 'invoice', pricelistFrom: 'partner', base: 10_000 });
    expect(cheque[0].issues).toContain(ISSUE.pricelistFromPartner);

    expect(byReceipt('PCHQ3')).toHaveLength(0);
    expect(byReceipt('โอนเข้า')[0]).toMatchObject({ cashDate: '2026-10-12', base: 0, gross: 500, issues: [ISSUE.notInvoice] });
  });

  it('gives the cash to the customer\'s "Sale" tag and merges a same-name salesperson into it', async () => {
    const data = {
      ...base,
      'res.partner.category': [{ id: 4, name: 'PCR' }, { id: 11, name: 'Sale สมชาย' }, { id: 12, name: 'Sale Tip' }],
      'res.partner': [{ id: 7, property_product_pricelist: [6, 'ราคาส่ง'], user_id: [9, 'สมหญิง'], category_id: [4, 12] }],
    };
    const tagged = await fetchCollections(fakeClient(data), '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    expect(tagged.lines.filter((l) => l.invoiceId).every((l) => l.odooUserId === -12 && l.repName === 'Tip' && l.ownerFrom === 'tag')).toBe(true);

    const untagged = await fetchCollections(fakeClient({ ...data, 'res.partner': [{ ...data['res.partner'][0], category_id: [4] }] }), '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    // INV/0001's order salesperson สมชาย (user 8) has a tag "Sale สมชาย": same rep, not a second one.
    expect(untagged.lines.find((l) => l.invoiceName === 'INV/0001')).toMatchObject({ odooUserId: -11, repName: 'สมชาย', ownerFrom: 'order', issues: [ISSUE.noRepTag] });
  });

  it('returns nothing for an empty period without extra reads', async () => {
    const client = fakeClient({});
    expect(await fetchCollections(client, '2026-10', { start: '2026-09-21', end: '2026-10-20' })).toEqual({ lines: [], receipts: 0, refunds: { count: 0, amount: 0 } });
    expect(client.calls.every((c) => c.endsWith('search_read'))).toBe(true);
  });

  it('pages through large results', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, name: `R${i}`, date: '2026-10-01', partner_id: false, move_id: false, payment_type: 'inbound', partner_type: 'customer', state: 'paid', is_matched: true }));
    const client = fakeClient({ 'account.payment': many });
    await fetchCollections(client, '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    expect(client.calls.filter((c) => c === 'account.payment.search_read').length).toBe(4);
  });
});

describe('fetchSales', () => {
  it('lists invoiced sales by invoice date with credit notes negative', async () => {
    const lines = await fetchSales(fakeClient(base), '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    expect(lines.map((l) => [l.invoiceName, l.base])).toEqual([['INV/0002', 10_000], ['RINV/0001', -5_000]]);
  });
});

describe('fetchCredits', () => {
  it('lists credit notes of the period with their rep and the customer refunds', async () => {
    const data = { ...base, 'account.move': base['account.move'].map((m) => ({ ...m, amount_untaxed: -Math.abs(Number(m.amount_total)) / 1.07, reversed_entry_id: m.move_type === 'out_refund' ? [100, 'INV/0001'] : false })) };
    const { credits, refunds } = await fetchCredits(fakeClient(data), { start: '2026-09-21', end: '2026-10-20' });
    expect(credits.map((c) => c.name)).toEqual(['RINV/0001']);
    // No salesperson on the credit note: falls back to the customer's rep, as for invoices.
    expect(credits[0]).toMatchObject({ originName: 'INV/0001', odooUserId: 9, repName: 'สมหญิง', base: 5_000 });
    expect(credits[0].base).toBeGreaterThan(0);
    expect(refunds).toEqual({ count: 1, amount: 300 });
    expect(await fetchCredits(fakeClient({}), { start: '2026-09-21', end: '2026-10-20' })).toEqual({ credits: [], refunds: { count: 0, amount: 0 } });
  });
});

describe('overdue invoices', () => {
  const data = {
    ...base,
    'account.move': [
      ...base['account.move'].map((m) => ({ ...m, payment_state: 'paid', amount_residual: 0, amount_untaxed: m.amount_total / 1.07 })),
      // 107,000 incl. VAT, 53,500 still unpaid, due 1 Jun: 141 days late on 20 Oct.
      { ...base['account.move'][0], id: 110, name: 'INV/OLD', invoice_date_due: '2026-06-01', payment_state: 'partial', amount_residual: 53_500, amount_untaxed: 100_000 },
      { ...base['account.move'][0], id: 111, name: 'INV/NEW', invoice_date_due: '2026-10-01', payment_state: 'not_paid', amount_residual: 107_000, amount_untaxed: 100_000 },
    ],
    'account.move.line': [...base['account.move.line'], { id: 20, move_id: [110, 'INV/OLD'], display_type: 'product', product_id: [501, 'x'], name: 'x', quantity: 1, price_subtotal: 100_000, price_total: 107_000, sale_line_ids: [71] }],
  };

  it('lists invoices unpaid past the set days with the unpaid amount before VAT and the rep', async () => {
    expect(await fetchOverdueInvoices(fakeClient(data), '2026-10-20', 120)).toEqual([
      { invoiceId: 110, invoiceName: 'INV/OLD', partnerName: 'ร้านยางดี', dueDate: '2026-06-01', odooUserId: 8, repName: 'สมชาย', residualBase: 50_000 },
    ]);
    expect(await fetchOverdueInvoices(fakeClient({}), '2026-10-20', 120)).toEqual([]);
  });

  it('tells which held invoices are now paid', async () => {
    expect([...await fetchPaidInvoiceIds(fakeClient(data), [100, 110])]).toEqual([100]);
    expect(await fetchPaidInvoiceIds(fakeClient(data), [])).toEqual(new Set());
  });
});

describe('reference reads', () => {
  it('reads users, pricelists, products and categories', async () => {
    const client = fakeClient(base);
    expect((await fetchOdooUsers(client)).map((u) => u.id)).toEqual([8]);
    expect(await fetchPricelists(client)).toEqual([{ id: 5, name: 'ราคาปลีก' }]);
    expect(await searchProducts(client, 'a2')).toEqual([{ id: 502, name: '[A2] Austone TBR', category: 'AUSTONE-TBR' }]);
    expect(await fetchCategories(client)).toEqual(['AUSTONE-PCR', 'AUSTONE-TBR']);
  });
});
