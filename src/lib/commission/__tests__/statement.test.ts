import { describe, expect, it } from 'vitest';
import { paymentKindOf } from '../ledger';
import { DEFAULT_SUMMARY_LINES, planDebt, statementSettings, summaryKeyOf, type OpenInvoice } from '../statement';

describe('paymentKindOf', () => {
  it('treats invoices due the day they are issued as cash', () => {
    expect(paymentKindOf({ invoiceDate: '2026-10-01', dueDate: '2026-10-01' })).toBe('CASH');
    expect(paymentKindOf({ invoiceDate: '2026-10-01', dueDate: null })).toBe('CASH');
    expect(paymentKindOf({ invoiceDate: '2026-10-01', dueDate: '2026-10-31' })).toBe('CREDIT');
  });
});

describe('statementSettings / summaryKeyOf', () => {
  it('falls back to the client sheet rows and converts numbers', () => {
    expect(statementSettings({ summaryLines: [], centralPercent: '5' as unknown as number })).toMatchObject({ summaryLines: DEFAULT_SUMMARY_LINES, centralPercent: 5, debtDays: 120, debtPercent: 0 });
    const own = [{ key: 'A', label: 'ทุกอย่าง', family: '*', priceGroup: '*' as const, paymentKind: '*' as const }];
    expect(statementSettings({ summaryLines: own }).summaryLines).toBe(own);
  });

  it('takes the first matching row, case-insensitively, else OTHER', () => {
    expect(summaryKeyOf(DEFAULT_SUMMARY_LINES, { family: 'pcr', paymentKind: 'CASH' }, 'RETAIL')).toBe('PCR-RETAIL-CASH');
    expect(summaryKeyOf(DEFAULT_SUMMARY_LINES, { family: 'PCR', paymentKind: 'CASH' }, 'WHOLESALE')).toBe('PCR-WHOLESALE');
    expect(summaryKeyOf(DEFAULT_SUMMARY_LINES, { family: 'WH', paymentKind: 'CREDIT' }, null)).toBe('WH');
    expect(summaryKeyOf(DEFAULT_SUMMARY_LINES, { family: 'PCR', paymentKind: 'CASH' }, null)).toBe('OTHER');
  });

  it('matches a row set on one Odoo pricelist only for that pricelist', () => {
    const rows = [{ key: 'PL9', label: 'PCR Cash', family: '*', priceGroup: '*' as const, paymentKind: '*' as const, pricelistId: 9, pricelistName: 'PCR Cash' }, ...DEFAULT_SUMMARY_LINES];
    expect(summaryKeyOf(rows, { family: 'PCR', paymentKind: 'CREDIT', pricelistId: 9 }, null)).toBe('PL9');
    expect(summaryKeyOf(rows, { family: 'PCR', paymentKind: 'CREDIT', pricelistId: 10 }, 'RETAIL')).toBe('PCR-RETAIL-CREDIT');
    expect(summaryKeyOf(rows, { family: 'PCR', paymentKind: 'CREDIT' }, null)).toBe('OTHER');
  });
});

describe('planDebt', () => {
  const invoice = (over: Partial<OpenInvoice> = {}): OpenInvoice => ({ invoiceId: 1, invoiceName: 'INV/1', partnerName: 'ร้าน', dueDate: '2026-06-20', odooUserId: 8, repName: 'A', residualBase: 35_220, ...over });
  const settings = { debtDays: 120, debtPercent: 1 };

  it('holds once an invoice is more than the set days past due on the period end', () => {
    // 2026-06-20 → 2026-10-20 = 122 days; 2026-06-22 = 120 days (not yet).
    const plan = planDebt({ period: '2026-10', asOf: '2026-10-20', settings, existing: [], overdue: [invoice(), invoice({ invoiceId: 2, dueDate: '2026-06-22' })], collectedPaid: new Set() });
    expect(plan.holds).toEqual([expect.objectContaining({ invoiceId: 1, amount: 352.2, percent: 1, heldPeriod: '2026-10', releasedPeriod: null })]);
    expect(planDebt({ period: '2026-11', asOf: '2026-11-20', settings, existing: [{ id: 'h', invoiceId: 1, heldPeriod: '2026-10', releasedPeriod: null }], overdue: [invoice()], collectedPaid: new Set() }).holds).toEqual([]);
  });

  it('holds nothing at 0% or for a zero balance', () => {
    expect(planDebt({ period: '2026-10', asOf: '2026-10-20', settings: { debtDays: 120, debtPercent: 0 }, existing: [], overdue: [invoice()], collectedPaid: new Set() }).holds).toEqual([]);
    expect(planDebt({ period: '2026-10', asOf: '2026-10-20', settings, existing: [], overdue: [invoice({ residualBase: 0 })], collectedPaid: new Set() }).holds).toEqual([]);
  });

  it('gives back earlier holds whose invoice is paid with cash collected this period', () => {
    const existing = [
      { id: 'a', invoiceId: 1, heldPeriod: '2026-08', releasedPeriod: null },
      { id: 'b', invoiceId: 2, heldPeriod: '2026-08', releasedPeriod: '2026-09' },
      { id: 'c', invoiceId: 3, heldPeriod: '2026-10', releasedPeriod: null },
      { id: 'd', invoiceId: 4, heldPeriod: '2026-08', releasedPeriod: null },
    ];
    expect(planDebt({ period: '2026-10', asOf: '2026-10-20', settings, existing, overdue: [], collectedPaid: new Set([1, 2, 3]) }).releaseIds).toEqual(['a']);
  });
});
