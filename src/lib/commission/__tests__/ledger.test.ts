import { describe, expect, it } from 'vitest';
import { ISSUE, buildLedger, isTagRep, lastCategorySegment, planFullPayment, repTagName, retroDiff, splitCategory, tagRepKey, withFinalCashDate, type LedgerInput, type RawInvoice } from '../ledger';

const invoice = (over: Partial<RawInvoice> = {}): RawInvoice => ({
  id: 100, name: 'INV/2026/0001', invoiceDate: '2026-09-01', dueDate: '2026-10-01', amountTotal: 107_000, partnerId: 7, partnerName: 'ร้านยางดี', invoiceUser: null, ...over,
});

/** Invoice of 107,000 incl. VAT: PCR 60,000 + TBR 40,000 before VAT, plus a -1,000 cash discount line. */
function input(over: Partial<LedgerInput> = {}): LedgerInput {
  return {
    period: '2026-10',
    receipts: [{ key: 'P1', name: 'PBNK/0001', cashDate: '2026-10-08', partnerName: 'ร้านยางดี' }],
    partials: [{ id: 11, receiptKey: 'P1', debitLineId: 900, amount: 53_500 }],
    debitLineMove: new Map([[900, 100]]),
    invoices: new Map([[100, invoice()]]),
    invoiceLines: [
      { id: 1, moveId: 100, productId: 501, productName: 'Austone 205/55R16', quantity: 20, subtotal: 60_600, total: 64_842, saleLineIds: [71] },
      { id: 2, moveId: 100, productId: 502, productName: 'Austone 11R22.5', quantity: 4, subtotal: 40_400, total: 43_228, saleLineIds: [72] },
      { id: 3, moveId: 100, productId: 999, productName: 'ส่วนลดเงินสด', quantity: 1, subtotal: -1_000, total: -1_070, saleLineIds: [] },
    ],
    saleLineOrder: new Map([[71, 30], [72, 30]]),
    orders: new Map([[30, { pricelist: [5, 'ราคาปลีก'], user: [8, 'สมชาย'] }]]),
    partners: new Map([[7, { pricelist: [6, 'ราคาส่ง'], user: [9, 'สมหญิง'] }]]),
    productCategory: new Map([[501, 'AUSTONE-PCR'], [502, 'AUSTONE-TBR']]),
    ...over,
  };
}

describe('splitCategory', () => {
  it('reads brand and family from the last category segment', () => {
    expect(lastCategorySegment('All / Saleable / YK-PCR')).toBe('YK-PCR');
    expect(splitCategory('All / Austone-pcr')).toEqual({ brand: 'AUSTONE', family: 'PCR' });
    expect(splitCategory('BRAND-X-TBR')).toEqual({ brand: 'BRAND-X', family: 'TBR' });
    expect(splitCategory('Services')).toEqual({ brand: 'SERVICES', family: '' });
    expect(splitCategory('')).toEqual({ brand: '', family: '' });
  });
});

describe('buildLedger', () => {
  it('splits half a payment over product lines before VAT, spreading the discount line', () => {
    const lines = buildLedger(input());
    expect(lines).toHaveLength(2);
    const [pcr, tbr] = lines;
    // ratio 0.5; discount spread: factor 100,000 / 101,000
    expect(pcr.base).toBeCloseTo(30_000, 2);
    expect(tbr.base).toBeCloseTo(20_000, 2);
    expect(pcr.base + tbr.base).toBeCloseTo(50_000, 2);
    expect(pcr.gross + tbr.gross).toBeCloseTo(53_500, 1);
    expect(pcr.qty).toBe(10);
    expect(tbr.qty).toBe(2);
    expect(pcr).toMatchObject({ brand: 'AUSTONE', family: 'PCR', invoiceName: 'INV/2026/0001', overdueDays: 7, pricelistId: 5, pricelistFrom: 'order', odooUserId: 8, ownerFrom: 'order', issues: [ISSUE.noRepTag] });
    expect(pcr.lineKey).toBe('P1:R11:L1');
  });

  it('prefers the invoice salesperson, then the order, then the customer', () => {
    expect(buildLedger(input({ invoices: new Map([[100, invoice({ invoiceUser: [3, 'ผู้ออกบิล'] })]]) }))[0]).toMatchObject({ odooUserId: 3, ownerFrom: 'invoice' });
    const noOrder = input({ saleLineOrder: new Map() });
    expect(buildLedger(noOrder)[0]).toMatchObject({ odooUserId: 9, ownerFrom: 'partner', pricelistId: 6, pricelistFrom: 'partner' });
    expect(buildLedger(noOrder)[0].issues).toContain(ISSUE.pricelistFromPartner);
    const nobody = input({ saleLineOrder: new Map(), partners: new Map() });
    expect(buildLedger(nobody)[0]).toMatchObject({ odooUserId: null, ownerFrom: 'none', pricelistFrom: 'none' });
    expect(buildLedger(nobody)[0].issues).toEqual(expect.arrayContaining([ISSUE.noRep, ISSUE.noPricelist]));
  });

  it('pays the customer\'s first "Sale" tag before any salesperson', () => {
    const tagged = input({ partners: new Map([[7, { pricelist: [6, 'ราคาส่ง'], user: [9, 'สมหญิง'], tags: [[tagRepKey(11), 'Tip']] }]]) });
    expect(buildLedger(tagged)[0]).toMatchObject({ odooUserId: -11, repName: 'Tip', ownerFrom: 'tag', issues: [] });
    const twoTags = input({ partners: new Map([[7, { pricelist: null, user: null, tags: [[-10, 'Ko'], [-5, 'Yai']] }]]) });
    expect(buildLedger(twoTags)[0]).toMatchObject({ odooUserId: -10, repName: 'Ko', ownerFrom: 'tag' });
    expect(buildLedger(twoTags)[0].issues).toContain(ISSUE.multiRepTag(['Ko', 'Yai']));
  });

  it('falls back to the salesperson, merged into the tag rep of the same name', () => {
    const merged = input({ userReps: new Map([[8, [-11, 'Tip']]]) });
    expect(buildLedger(merged)[0]).toMatchObject({ odooUserId: -11, repName: 'Tip', ownerFrom: 'order', issues: [ISSUE.noRepTag] });
    // A shared login (Sea) has no tag of its own and stays a user rep.
    expect(buildLedger(input({ userReps: new Map([[20, [-11, 'Tip']]]) }))[0]).toMatchObject({ odooUserId: 8, repName: 'สมชาย' });
  });

  it('recognises rep tags by name', () => {
    expect(repTagName('Sale Tip')).toBe('Tip');
    expect(repTagName('sales  Wit ')).toBe('Wit');
    expect(repTagName('Sale')).toBeNull();
    expect(repTagName('Salesman')).toBeNull();
    expect(repTagName('Wholesale')).toBeNull();
    expect(repTagName('PCR')).toBeNull();
    expect(isTagRep(tagRepKey(6))).toBe(true);
    expect(isTagRep(6)).toBe(false);
  });

  it('reports cash applied to something that is not an invoice', () => {
    const lines = buildLedger(input({ debitLineMove: new Map([[900, 555]]) }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ base: 0, gross: 53_500, invoiceId: null, issues: [ISSUE.notInvoice] });
  });

  it('flags invoices without product lines or due date and caps over-payment at the invoice', () => {
    const empty = buildLedger(input({ invoiceLines: [] }));
    expect(empty[0].issues).toContain(ISSUE.noProductLines);
    const noDue = buildLedger(input({ invoices: new Map([[100, invoice({ dueDate: null })]]), partials: [{ id: 11, receiptKey: 'P1', debitLineId: 900, amount: 200_000 }] }));
    expect(noDue[0].issues).toContain(ISSUE.noDueDate);
    expect(noDue[0].overdueDays).toBe(0);
    expect(noDue.reduce((s, l) => s + l.base, 0)).toBeCloseTo(100_000, 2);
  });

  it('splits one receipt over two invoices, each with its own days overdue', () => {
    const second = invoice({ id: 101, name: 'INV/2026/0002', dueDate: '2026-09-20', amountTotal: 10_700 });
    const lines = buildLedger(input({
      partials: [{ id: 11, receiptKey: 'P1', debitLineId: 900, amount: 107_000 }, { id: 12, receiptKey: 'P1', debitLineId: 901, amount: 10_700 }],
      debitLineMove: new Map([[900, 100], [901, 101]]),
      invoices: new Map([[100, invoice()], [101, second]]),
      invoiceLines: [...input().invoiceLines, { id: 4, moveId: 101, productId: 501, productName: 'Austone', quantity: 2, subtotal: 10_000, total: 10_700, saleLineIds: [] }],
    }));
    expect(lines.filter((l) => l.invoiceId === 101)[0].overdueDays).toBe(18);
    expect(lines.filter((l) => l.invoiceId === 100).every((l) => l.overdueDays === 7)).toBe(true);
  });

  it('matches the cash received to the satang despite rounding each line', () => {
    const lines = buildLedger(input({
      invoices: new Map([[100, invoice({ amountTotal: 321 })]]),
      partials: [{ id: 11, receiptKey: 'P1', debitLineId: 900, amount: 100 }],
      invoiceLines: [1, 2, 3].map((id) => ({ id, moveId: 100, productId: 501, productName: 'x', quantity: 1, subtotal: 100, total: 107, saleLineIds: [] })),
    }));
    expect(Math.round(lines.reduce((s, l) => s + l.gross, 0) * 100)).toBe(10_000);
    expect(Math.round(lines.reduce((s, l) => s + l.base, 0) * 100)).toBe(Math.round((300 * 100) / 321 * 100));
  });

  it('skips unknown receipts and zero amounts', () => {
    expect(buildLedger(input({ partials: [{ id: 1, receiptKey: 'X', debitLineId: 900, amount: 10 }, { id: 2, receiptKey: 'P1', debitLineId: 900, amount: 0 }] }))).toEqual([]);
  });
});

describe('retroDiff', () => {
  it('books cancelled and changed lines as differences of the locked period', () => {
    const paid = buildLedger(input());
    const fresh = paid.slice(1).map((l) => ({ ...l, base: l.base + 100 }));
    const retro = retroDiff(paid, fresh, '2026-10');
    expect(retro).toHaveLength(2);
    const cancelled = retro.find((r) => r.lineKey === paid[0].lineKey)!;
    expect(cancelled).toMatchObject({ kind: 'RETRO', originPeriod: '2026-10', base: -paid[0].base, qty: -paid[0].qty });
    expect(cancelled.issues.at(-1)).toContain('ถูกยกเลิก');
    expect(retro.find((r) => r.lineKey === paid[1].lineKey)!.base).toBe(100);
  });

  it('nets corrections already booked and returns nothing when Odoo is unchanged', () => {
    const paid = buildLedger(input());
    expect(retroDiff(paid, paid, '2026-10')).toEqual([]);
    const firstFix = retroDiff(paid, [], '2026-10');
    expect(retroDiff([...paid, ...firstFix], [], '2026-10')).toEqual([]);
  });
});

describe('planFullPayment', () => {
  const range = { start: '2026-10-21', end: '2026-11-20' };
  const invoices = new Map([[1, { amountTotal: 38_500 }], [2, { amountTotal: 1_000 }], [3, { amountTotal: 500 }]]);
  const s = (partialId: number, invoiceId: number, amount: number, date: string | null, cash = true) => ({ partialId, invoiceId, amount, date, cash, name: `P${partialId}` });

  it('defers part-paid invoices, adds earlier cash of invoices completed now, skips credit notes', () => {
    const out = planFullPayment({
      range, invoices,
      settlements: [s(10, 1, 38_000, '2026-10-30'), s(20, 2, 400, '2026-10-01'), s(21, 2, 100, '2026-10-02', false), s(22, 2, 500, '2026-11-05'), s(30, 3, 500, '2026-09-01'), s(31, 3, 50, null)],
      currentPartialIds: new Set([10, 22, 31]),
    });
    expect([...out.deferred]).toEqual([1]);
    // Invoice 2: the 400 cash of 1 Oct joins this period; the 100 credit note is not cash. Invoice 3 was settled before: nothing added.
    expect(out.earlier.map((e) => e.partialId)).toEqual([20]);
  });
});

describe('withFinalCashDate', () => {
  it('dates every line of an invoice with its last cash and recomputes days overdue', () => {
    const base = { kind: 'COLLECTION', invoiceId: 1, dueDate: '2026-10-01', overdueDays: 0 } as const;
    const out = withFinalCashDate([{ ...base, cashDate: '2026-10-02' } as never, { ...base, cashDate: '2026-10-11', overdueDays: 10 } as never, { ...base, invoiceId: null, cashDate: '2026-10-01' } as never]);
    expect(out.map((l) => [l.cashDate, l.overdueDays])).toEqual([['2026-10-11', 10], ['2026-10-11', 10], ['2026-10-01', 0]]);
  });
});
