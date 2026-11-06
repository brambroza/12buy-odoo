import { describe, expect, it } from 'vitest';
import { bonusSettings, JFC_2569_TIERS, normalizeTiers, pickTier, planNewCustomers, type FirstInvoice } from '../bonus';
import { calculateRun } from '../calc';
import type { LedgerLine } from '../types';

describe('pickTier', () => {
  it('returns the highest tier reached, null below the first', () => {
    expect(pickTier(JFC_2569_TIERS, 2_299_999.99)).toBeNull();
    expect(pickTier(JFC_2569_TIERS, 2_300_000)).toMatchObject({ index: 1, bonus: 3_000 });
    expect(pickTier(JFC_2569_TIERS, 2_899_999)).toMatchObject({ index: 2, bonus: 4_000 });
    expect(pickTier(JFC_2569_TIERS, 9_000_000)).toMatchObject({ index: 10, bonus: 4_000 });
    expect(pickTier([], 9_000_000)).toBeNull();
  });

  it('works on unsorted tiers', () => {
    expect(pickTier([{ minAmount: 200, bonus: 2 }, { minAmount: 100, bonus: 1 }], 150)).toMatchObject({ index: 1, bonus: 1 });
  });
});

describe('normalizeTiers / bonusSettings', () => {
  it('drops bad rows, sorts and keeps one tier per minimum', () => {
    expect(normalizeTiers([{ minAmount: 300, bonus: 3 }, { minAmount: 0, bonus: 1 }, { minAmount: 100, bonus: -1 }, { minAmount: 100, bonus: 1 }, { minAmount: 300, bonus: 4 }]))
      .toEqual([{ minAmount: 100, bonus: 1 }, { minAmount: 300, bonus: 4 }]);
    expect(normalizeTiers(null)).toEqual([]);
  });

  it('pays nothing until set (columns missing before the migration)', () => {
    expect(bonusSettings({})).toEqual({ bonusTiers: [], newCustomerBonus: 0, newCustomerFrom: null });
    expect(bonusSettings({ newCustomerBonus: '300' as unknown as number, newCustomerFrom: '2026-11-01T00:00:00' })).toMatchObject({ newCustomerBonus: 300, newCustomerFrom: '2026-11-01' });
  });
});

const first = (over: Partial<FirstInvoice>): FirstInvoice => ({ partnerId: 1, partnerName: 'ร้านใหม่', partnerCreated: '2026-11-02', invoiceId: 10, invoiceName: 'INV/10', ...over });
const cash = (invoiceId: number, cashDate: string, odooUserId: number | null = -7) => ({ kind: 'COLLECTION', invoiceId, cashDate, odooUserId, repName: 'Ake' });

describe('planNewCustomers', () => {
  it('counts a customer created after the start day whose first invoice had cash in the period', () => {
    const out = planNewCustomers({ period: '2026-11', from: '2026-11-01', counted: new Set(), firsts: [first({})], lines: [cash(10, '2026-11-05'), cash(10, '2026-11-03')] });
    expect(out).toEqual([{ odooPartnerId: 1, partnerName: 'ร้านใหม่', partnerCreated: '2026-11-02', invoiceId: 10, invoiceName: 'INV/10', cashDate: '2026-11-03', odooUserId: -7, repName: 'Ake', period: '2026-11' }]);
  });

  it('skips old customers, customers already counted, later invoices, RETRO lines and when switched off', () => {
    const lines = [cash(10, '2026-11-05')];
    expect(planNewCustomers({ period: '2026-11', from: '2026-11-03', counted: new Set(), firsts: [first({})], lines })).toEqual([]);
    expect(planNewCustomers({ period: '2026-11', from: '2026-11-01', counted: new Set([1]), firsts: [first({})], lines })).toEqual([]);
    expect(planNewCustomers({ period: '2026-11', from: '2026-11-01', counted: new Set(), firsts: [first({ invoiceId: 9 })], lines })).toEqual([]);
    expect(planNewCustomers({ period: '2026-11', from: '2026-11-01', counted: new Set(), firsts: [first({})], lines: [{ ...cash(10, '2026-11-05'), kind: 'RETRO' }] })).toEqual([]);
    expect(planNewCustomers({ period: '2026-11', from: null, counted: new Set(), firsts: [first({})], lines })).toEqual([]);
    expect(planNewCustomers({ period: '2026-11', from: '2026-11-01', counted: new Set(), firsts: [first({ partnerCreated: null })], lines })).toEqual([]);
  });
});

describe('calculateRun with bonuses', () => {
  const line = (base: number): LedgerLine => ({
    kind: 'COLLECTION', originPeriod: '2026-11', lineKey: `k${base}`, receiptName: 'R', cashDate: '2026-11-05', partnerName: 'ร้าน', invoiceId: 1, invoiceName: 'INV/1',
    invoiceDate: '2026-11-01', dueDate: '2026-11-01', overdueDays: 4, paymentKind: 'CREDIT', odooUserId: -7, repName: 'Ake', ownerFrom: 'tag', pricelistId: null, pricelistName: null, pricelistFrom: 'none',
    productId: 1, productName: 'ยาง', brand: 'AT', family: 'TBR', qty: 10, base, gross: base * 1.07, issues: [],
  });
  const calc = (base: number, target: number) => calculateRun({
    lines: [line(base)],
    rates: [{ id: 'r', sourceId: 's', brand: '*', family: 'TBR', priceGroup: '*', odooPricelistId: null, pricelistName: null, odooProductId: null, productName: null, kind: 'PER_UNIT', value: 15, validFrom: '2026-01-01', validTo: null, note: null }],
    steps: [{ id: 'st', sourceId: 's', minDays: 0, maxDays: null, percent: 100, validFrom: '2026-01-01', validTo: null }],
    pricelists: [], targets: [{ id: 't', sourceId: 's', odooUserId: -7, period: '2026-11', amount: target }], adjustments: [], reps: [{ odooUserId: -7, name: 'Ake' }], carryIn: new Map(), period: '2026-11',
    statement: { summaryLines: [], centralPercent: 5, debtDays: 120, debtPercent: 0 },
    bonus: { bonusTiers: JFC_2569_TIERS, newCustomerBonus: 300, newCustomerFrom: '2026-11-01' },
    newCustomers: [
      { odooUserId: -7, repName: 'Ake', partnerName: 'ร้านใหม่', invoiceName: 'INV/1', period: '2026-11' },
      { odooUserId: -7, repName: 'Ake', partnerName: 'ร้านเก่ากว่า', invoiceName: 'INV/0', period: '2026-10' },
      { odooUserId: null, repName: null, partnerName: 'ไม่มีเซลล์', invoiceName: 'INV/2', period: '2026-11' },
    ],
  });

  it('adds the tier bonus and new customers after the central fund', () => {
    const results = calc(2_650_000, 1_000_000);
    const rep = results.reps[0];
    // 10 tires × 15 = 150, central 5% = 7.50, + tier 2 (4,000) + 1 new customer (300).
    expect(rep).toMatchObject({ commission: 150, central: 7.5, tier: { index: 2, minAmount: 2_600_000 }, tierBonus: 4_000, newCustomerBonus: 300, payable: 4_442.5 });
    expect(rep.newCustomers).toEqual([{ partnerName: 'ร้านใหม่', invoiceName: 'INV/1' }]);
    expect(results.issues.some((i) => i.message.includes('ไม่มีเซลล์'))).toBe(true);
  });

  it('pays no bonus when the target is missed', () => {
    const rep = calc(2_650_000, 3_000_000).reps[0];
    expect(rep).toMatchObject({ targetMet: false, tier: { index: 2 }, tierBonus: 0, newCustomerBonus: 0, payable: 0 });
  });

  it('pays no tier bonus below the first tier', () => {
    expect(calc(1_000_000, 0).reps[0]).toMatchObject({ tier: null, tierBonus: 0, newCustomerBonus: 300 });
  });
});
