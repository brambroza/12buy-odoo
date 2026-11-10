import { describe, expect, it } from 'vitest';
import type { OdooReadClient } from '@/lib/odoo/rpc';
import { ISSUE } from '../ledger';
import { bangkokToUtc, fetchCategories, fetchCollections, fetchCredits, fetchOdooUsers, fetchOverdueInvoices, fetchPaidInvoiceIds, fetchPricelists, fetchInvoiceSales, fetchSaleOrders, fetchSales, searchProducts, utcToBangkokDay } from '../odoo';

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
    // INV/0001's receivable: half paid on 10 Sep (earlier period, deferred then), half by PBNK1 now.
    { id: 900, move_id: [100, 'INV1'], account_type: 'asset_receivable', matched_credit_ids: [50, 70] }, { id: 901, move_id: [101, 'INV2'] }, { id: 902, move_id: [300, 'MISC'] },
    { id: 950, move_id: [1005, 'PBNK0'], journal_id: [1, 'Bank'] },
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
    { id: 70, debit_move_id: [900, 'x'], credit_move_id: [950, 'PBNK0'], amount: 53_500, max_date: '2026-09-10' },
  ],
  'account.journal': [{ id: 1, type: 'bank' }],
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
    // INV/0001 is fully paid now: the 10 Sep half (deferred then) is counted too, dated with the final cash.
    const earlier = byReceipt('PBNK0');
    expect(earlier).toHaveLength(2);
    expect(earlier.reduce((t, l) => t + l.base, 0)).toBe(50_000);
    expect(earlier[0]).toMatchObject({ invoiceName: 'INV/0001', cashDate: '2026-10-08', overdueDays: 7 });
    expect(result.deferred).toEqual([]);
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

  it('defers an invoice that is not fully paid by the period end', async () => {
    const partly = { ...base, 'account.move.line': base['account.move.line'].map((l) => (l.id === 900 ? { ...l, matched_credit_ids: [50] } : l)) };
    const result = await fetchCollections(fakeClient(partly), '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    expect(result.lines.some((l) => l.invoiceName === 'INV/0001')).toBe(false);
    expect(result.lines.some((l) => l.invoiceName === 'INV/0002')).toBe(true);
    expect(result.deferred).toEqual([{ invoiceId: 100, invoiceName: 'INV/0001', partnerName: 'ร้านยางดี', amountTotal: 107_000, settled: 53_500, cashThisPeriod: 53_500 }]);
  });

  it('returns nothing for an empty period without extra reads', async () => {
    const client = fakeClient({});
    expect(await fetchCollections(client, '2026-10', { start: '2026-09-21', end: '2026-10-20' })).toEqual({ lines: [], receipts: 0, refunds: { count: 0, amount: 0 }, deferred: [] });
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

describe('fetchInvoiceSales', () => {
  it('one document per invoice of the period, credit notes negative', async () => {
    const docs = await fetchInvoiceSales(fakeClient(base), '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    expect(docs.map((d) => [d.orderName, d.orderDate, d.amountUntaxed])).toEqual([['INV/0002', '2026-09-21', 10_000], ['RINV/0001', '2026-10-02', -5_000]]);
    expect(docs[0]).toMatchObject({ odooUserId: 3, period: '2026-10' });
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

describe('fetchSaleOrders', () => {
  it('converts Bangkok days to Odoo UTC and back', () => {
    expect(bangkokToUtc('2026-10-21')).toBe('2026-10-20 17:00:00');
    expect(bangkokToUtc('2026-11-20', true)).toBe('2026-11-20 16:59:59');
    expect(utcToBangkokDay('2026-11-20 18:30:00')).toBe('2026-11-21');
  });

  it('reads confirmed orders of the period with the customer tag rep, else the salesperson', async () => {
    const client = fakeClient({
      'sale.order': [
        { id: 1, name: 'S1', state: 'sale', date_order: '2026-10-20 17:30:00', amount_untaxed: 1000, amount_total: 1070, partner_id: [11, 'สาขา 1'], user_id: [5, 'Sea'] },
        { id: 2, name: 'S2', state: 'done', date_order: '2026-11-01 03:00:00', amount_untaxed: 500, amount_total: 535, partner_id: [20, 'ร้านไม่มี tag'], user_id: [6, 'Tip'] },
        { id: 3, name: 'S3', state: 'cancel', date_order: '2026-11-01 03:00:00', amount_untaxed: 999, amount_total: 999, partner_id: [20, 'x'], user_id: false },
        { id: 4, name: 'S4', state: 'sale', date_order: '2026-10-20 16:00:00', amount_untaxed: 7, amount_total: 7, partner_id: [20, 'x'], user_id: false },
      ],
      'res.partner': [
        { id: 10, commercial_partner_id: [10, 'บริษัทแม่'], category_id: [3] },
        { id: 11, commercial_partner_id: [10, 'บริษัทแม่'], category_id: [] },
        { id: 20, commercial_partner_id: [20, 'ร้านไม่มี tag'], category_id: [] },
      ],
      'res.partner.category': [{ id: 3, name: 'Sale Wit' }, { id: 4, name: 'Sale Tip' }],
      'res.users': [{ id: 5, name: 'Sea', login: 's', share: false }, { id: 6, name: 'Tip', login: 't', share: false }],
    });
    const out = await fetchSaleOrders(client, '2026-11', { start: '2026-10-21', end: '2026-11-20' });
    expect(out).toEqual([
      { orderId: 1, orderName: 'S1', orderDate: '2026-10-21', partnerName: 'สาขา 1', odooUserId: -3, repName: 'Wit', amountUntaxed: 1000, amountTotal: 1070, period: '2026-11' },
      { orderId: 2, orderName: 'S2', orderDate: '2026-11-01', partnerName: 'ร้านไม่มี tag', odooUserId: -4, repName: 'Tip', amountUntaxed: 500, amountTotal: 535, period: '2026-11' },
    ]);
  });
});
