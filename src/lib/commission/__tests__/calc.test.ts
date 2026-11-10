import { describe, expect, it } from 'vitest';
import { blockingIssues, calculateRun, isValidOn, lineCommission, pickRate, pickStepPercent, rateLabel, stepProblems, stepRangeLabel, type CalcInput } from '../calc';
import { statementSettings } from '../statement';
import type { CommissionPricelist, CommissionRate, LedgerLine, OverdueStep } from '../types';

const rate = (over: Partial<CommissionRate>): CommissionRate => ({
  id: 'r', sourceId: 's', brand: 'AUSTONE', family: 'PCR', priceGroup: 'RETAIL', odooPricelistId: null, pricelistName: null, odooProductId: null, productName: null, kind: 'PERCENT', value: 0.9,
  validFrom: '2026-01-01', validTo: null, note: null, ...over,
});

/** The client's starting rules. */
const RATES: CommissionRate[] = [
  rate({ id: 'pcr-r', family: 'PCR', priceGroup: 'RETAIL', value: 0.9 }),
  rate({ id: 'pcr-w', family: 'PCR', priceGroup: 'WHOLESALE', value: 0.4 }),
  rate({ id: 'tbr-r', family: 'TBR', priceGroup: 'RETAIL', value: 0.6 }),
  rate({ id: 'tbr-w', family: 'TBR', priceGroup: 'WHOLESALE', value: 0.3 }),
];
const step = (minDays: number, maxDays: number | null, percent: number, validFrom = '2026-01-01'): OverdueStep => ({ id: `${minDays}`, sourceId: 's', minDays, maxDays, percent, validFrom, validTo: null });
const STEPS = [step(0, 10, 110), step(11, 15, 100), step(16, 20, 90)];
const pricelist = (id: number, priceGroup: CommissionPricelist['priceGroup'], isSpecial = false): CommissionPricelist => ({ id: `p${id}`, sourceId: 's', odooPricelistId: id, name: `PL${id}`, priceGroup, isSpecial, specialPercent: 50 });
const PRICELISTS = [pricelist(1, 'RETAIL'), pricelist(2, 'WHOLESALE'), pricelist(3, 'RETAIL', true)];

const line = (over: Partial<LedgerLine>): LedgerLine => ({
  kind: 'COLLECTION', originPeriod: '2026-10', lineKey: `k${Math.random()}`, receiptName: 'PBNK/1', cashDate: '2026-10-08', partnerName: 'ร้าน', invoiceId: 1, invoiceName: 'INV/1',
  invoiceDate: '2026-09-01', dueDate: '2026-10-01', overdueDays: 7, paymentKind: 'CREDIT', odooUserId: 8, repName: 'สมชาย', ownerFrom: 'invoice', pricelistId: 1, pricelistName: 'PL1', pricelistFrom: 'order',
  productId: 501, productName: 'Austone', brand: 'AUSTONE', family: 'PCR', qty: 10, base: 100_000, gross: 107_000, issues: [], ...over,
});

const run = (lines: LedgerLine[], over: Partial<CalcInput> = {}) => calculateRun({
  lines, rates: RATES, steps: STEPS, pricelists: PRICELISTS, targets: [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-10', amount: 0 }], adjustments: [], reps: [{ odooUserId: 8, name: 'สมชาย' }],
  carryIn: new Map(), period: '2026-10', ...over,
});

describe('pickRate', () => {
  it('matches brand, family and price group case-insensitively', () => {
    expect(pickRate(RATES, line({ family: 'tbr' }), 'WHOLESALE')?.id).toBe('tbr-w');
    expect(pickRate(RATES, line({ brand: 'OTHER' }), 'RETAIL')).toBeNull();
    expect(pickRate(RATES, line({}), null)).toBeNull();
  });

  it('prefers a product override, then the most specific rule, then the newest', () => {
    const rates = [...RATES, rate({ id: 'any', brand: '*', family: '*', priceGroup: '*', value: 0.1 }), rate({ id: 'prod', odooProductId: 501, brand: '*', family: '*', priceGroup: '*', kind: 'PER_UNIT', value: 15 }),
      rate({ id: 'pcr-r-new', value: 1.0, validFrom: '2026-10-01' })];
    expect(pickRate(rates, line({}), 'RETAIL')?.id).toBe('prod');
    expect(pickRate(rates, line({ productId: 777 }), 'RETAIL')?.id).toBe('pcr-r-new');
    expect(pickRate(rates, line({ productId: 777, cashDate: '2026-09-30' }), 'RETAIL')?.id).toBe('pcr-r');
    expect(pickRate(rates, line({ productId: 777, brand: 'X' }), 'OTHER')?.id).toBe('any');
    expect(pickRate([rate({ odooProductId: 501, priceGroup: 'WHOLESALE' })], line({}), 'RETAIL')).toBeNull();
  });

  it('prefers a rate on the line Odoo pricelist over its price group', () => {
    const rates = [...RATES, rate({ id: 'pl1', brand: '*', family: '*', priceGroup: '*', odooPricelistId: 1, pricelistName: 'PL1', value: 0.5 })];
    expect(pickRate(rates, line({ pricelistId: 1 }), 'RETAIL')?.id).toBe('pl1');
    expect(pickRate(rates, line({ pricelistId: 3 }), 'RETAIL')?.id).toBe('pcr-r');
    expect(pickRate(rates, line({ pricelistId: null }), null)).toBeNull();
    // An unmapped pricelist (no group) still gets its own rate; a product rate still wins.
    expect(pickRate(rates, line({ pricelistId: 1 }), null)?.id).toBe('pl1');
    expect(pickRate([...rates, rate({ id: 'prod', odooProductId: 501, priceGroup: '*' })], line({ pricelistId: 1 }), 'RETAIL')?.id).toBe('prod');
    expect(pickRate([...rates, rate({ id: 'prod-pl', odooProductId: 501, priceGroup: '*', odooPricelistId: 1 }), rate({ id: 'prod', odooProductId: 501, priceGroup: 'RETAIL' })], line({ pricelistId: 1 }), 'RETAIL')?.id).toBe('prod-pl');
  });

  it('respects the validity window', () => {
    expect(isValidOn({ validFrom: '2026-01-01', validTo: '2026-10-07' }, '2026-10-08')).toBe(false);
    expect(isValidOn({ validFrom: '2026-01-01', validTo: '2026-10-08' }, '2026-10-08')).toBe(true);
    expect(isValidOn({ validFrom: '2026-10-09', validTo: null }, '2026-10-08')).toBe(false);
  });
});

describe('overdue steps', () => {
  it('picks the step for each boundary and pays 0 beyond the last', () => {
    expect([0, 10, 11, 15, 16, 20, 21].map((d) => pickStepPercent(STEPS, d, '2026-10-08'))).toEqual([110, 110, 100, 100, 90, 90, 0]);
    expect(pickStepPercent([...STEPS, step(0, 10, 120, '2026-10-01')], 5, '2026-10-08')).toBe(120);
  });

  it('reports overlaps and gaps', () => {
    expect(stepProblems(STEPS)).toEqual([]);
    expect(stepProblems([step(0, 10, 1), step(10, 15, 1)])[0]).toContain('ซ้อน');
    expect(stepProblems([step(0, 10, 1), step(12, 15, 1)])[0]).toContain('11–11');
    expect(stepProblems([step(1, 10, 1)])[0]).toContain('เริ่มที่ 0');
    expect(stepProblems([step(0, null, 1), step(5, 9, 1)])[0]).toContain('ซ้อน');
  });
});

describe('lineCommission', () => {
  it('applies rate × special % × step % (client example: 100,000 PCR retail paid 7 days late = 990)', () => {
    expect(lineCommission(line({}), { rates: RATES, steps: STEPS }, PRICELISTS[0]).commission).toBeCloseTo(990, 6);
    expect(lineCommission(line({ pricelistId: 3 }), { rates: RATES, steps: STEPS }, PRICELISTS[2]).commission).toBeCloseTo(495, 6);
    expect(lineCommission(line({ family: 'TBR', overdueDays: 18 }), { rates: RATES, steps: STEPS }, PRICELISTS[1]).commission).toBeCloseTo(270, 6);
    expect(lineCommission(line({ overdueDays: 25 }), { rates: RATES, steps: STEPS }, PRICELISTS[0]).commission).toBe(0);
  });

  it('pays baht per unit and explains missing rates', () => {
    const perUnit = [rate({ kind: 'PER_UNIT', value: 15, priceGroup: '*' })];
    expect(lineCommission(line({ qty: 4, overdueDays: 12 }), { rates: perUnit, steps: STEPS }, PRICELISTS[0]).commission).toBe(60);
    const missing = lineCommission(line({ brand: 'X' }), { rates: RATES, steps: STEPS }, undefined);
    expect(missing.commission).toBe(0);
    expect(missing.issue).toContain('pricelist ยังไม่จัดกลุ่ม');
    expect(lineCommission(line({ productId: null }), { rates: RATES, steps: STEPS }, PRICELISTS[0]).commission).toBe(0);
    expect(rateLabel({ kind: 'PER_UNIT', value: 15 })).toBe('฿15/หน่วย');
  });

  it('explains rules that start after the cash date', () => {
    const late = lineCommission(line({ cashDate: '2026-10-08' }), { rates: [rate({ validFrom: '2026-11-04' })], steps: STEPS }, PRICELISTS[0]);
    expect(late.commission).toBe(0);
    expect(late.issue).toContain('เริ่มใช้ 2026-11-04 หลังวันเงินเข้า 2026-10-08');
    // No overdue step in force on the cash date: paid at 100%, no warning.
    const noStep = lineCommission(line({ cashDate: '2026-10-08' }), { rates: RATES, steps: [step(0, 10, 110, '2026-11-04')] }, PRICELISTS[0]);
    expect(noStep).toMatchObject({ stepPercent: 100, noSteps: true, stepRange: null });
    expect(noStep.commission).toBeCloseTo(noStep.beforeStep!, 6);
    expect(noStep.commission).toBeGreaterThan(0);
    expect(noStep.issue).toBeUndefined();
    expect(lineCommission(line({ overdueDays: 400 }), { rates: RATES, steps: [] }, PRICELISTS[0])).toMatchObject({ stepPercent: 100, noSteps: true });
    expect(pickStepPercent([], 400, '2026-10-08')).toBe(100);
    // With steps set up, beyond the last one still pays 0%.
    expect(pickStepPercent(STEPS, 400, '2026-10-08')).toBe(0);
    expect(lineCommission(line({ overdueDays: 40 }), { rates: RATES, steps: STEPS }, PRICELISTS[0]).issue).toBeUndefined();
  });
});

describe('calculateRun', () => {
  it('sums per rep and rounds at the rep level', () => {
    const r = run([line({ base: 33_333.33 }), line({ base: 33_333.33 }), line({ base: 33_333.34 })]);
    expect(r.reps).toHaveLength(1);
    expect(r.reps[0]).toMatchObject({ odooUserId: 8, repName: 'สมชาย', base: 100_000, commission: 990, payable: 990, carryOut: 0, target: 0, targetMet: true });
    expect(r.totalPayable).toBe(990);
    expect(blockingIssues(r)).toEqual([]);
  });

  it('gates on the target: exactly at target pays, 0.01 short pays nothing', () => {
    const target = (amount: number) => [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-10', amount }];
    expect(run([line({})], { targets: target(100_000) }).reps[0]).toMatchObject({ targetMet: true, payable: 990 });
    expect(run([line({})], { targets: target(100_000.01) }).reps[0]).toMatchObject({ targetMet: false, commission: 0, payable: 0 });
  });

  it('applies the target mode to this period\'s commission (base 100,000 earns 990)', () => {
    const target = (amount: number) => [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-10', amount }];
    const mode = (targetMode: 'GATE' | 'EXCESS' | 'PROPORTIONAL' | 'LADDER', targetSteps = [] as { minPercent: number; payPercent: number }[]) => ({ targetMode, targetSteps });
    // EXCESS: only the 20,000 above an 80,000 target, 20% of 990.
    expect(run([line({})], { targets: target(80_000), target: mode('EXCESS') }).reps[0]).toMatchObject({ commission: 198, targetPayPercent: 20, targetPercent: 125, targetMet: true });
    expect(run([line({})], { targets: target(100_000), target: mode('EXCESS') }).reps[0]).toMatchObject({ commission: 0, targetMet: true });
    // PROPORTIONAL: 80% of the target pays 80%, above it at most 100%.
    expect(run([line({})], { targets: target(125_000), target: mode('PROPORTIONAL') }).reps[0]).toMatchObject({ commission: 792, targetPayPercent: 80, targetMet: false });
    expect(run([line({})], { targets: target(50_000), target: mode('PROPORTIONAL') }).reps[0]).toMatchObject({ commission: 990, targetPayPercent: 100 });
    // LADDER: exactly 80% reaches the 80% step.
    const ladder = mode('LADDER', [{ minPercent: 80, payPercent: 50 }, { minPercent: 100, payPercent: 100 }, { minPercent: 120, payPercent: 110 }]);
    expect(run([line({})], { targets: target(125_000), target: ladder }).reps[0]).toMatchObject({ commission: 495, targetPayPercent: 50 });
    expect(run([line({})], { targets: target(125_000.01), target: ladder }).reps[0]).toMatchObject({ commission: 0, targetPayPercent: 0 });
    expect(run([line({})], { targets: target(80_000), target: ladder }).reps[0]).toMatchObject({ commission: 1089, targetPayPercent: 110 });
    // No target (0) pays in full under every mode.
    expect(run([line({})], { target: mode('EXCESS') }).reps[0]).toMatchObject({ commission: 990, targetPayPercent: 100, targetPercent: null });
  });

  it('scales only this period, not corrections of earlier ones', () => {
    const r = run([line({}), line({ kind: 'RETRO', base: -10_000 })], { targets: [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-10', amount: 80_000 }], target: { targetMode: 'PROPORTIONAL', targetSteps: [] } });
    // Collected 90,000 of 80,000: 100% of 990, plus the −99 correction.
    expect(r.reps[0]).toMatchObject({ targetPayPercent: 100, commission: 891 });
  });

  it('pays in full without blocking when a rep has no target', () => {
    const r = run([line({})], { targets: [], target: { targetMode: 'EXCESS', targetSteps: [] } });
    expect(blockingIssues(r)).toEqual([]);
    expect(r.issues.some((i) => i.message.includes('เป้า'))).toBe(false);
    expect(r.reps[0]).toMatchObject({ target: null, commission: 990, targetPayPercent: 100 });
    expect(run([line({})], { targets: [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-09', amount: 0 }] }).reps[0].target).toBeNull();
  });

  it('adds adjustments, deducts carried negatives and carries a negative total forward', () => {
    const r = run([line({})], { adjustments: [{ odooUserId: 8, amount: 10 }], carryIn: new Map([[8, -200]]) });
    expect(r.reps[0]).toMatchObject({ commission: 990, adjustments: 10, carryIn: -200, payable: 800 });
    const negative = run([line({ kind: 'RETRO', base: -200_000 })]);
    expect(negative.reps[0]).toMatchObject({ commission: -1980, payable: 0, carryOut: -1980 });
    expect(negative.totalPayable).toBe(0);
  });

  it('still deducts corrections when the target is missed', () => {
    const r = run([line({ base: 1000 }), line({ kind: 'RETRO', base: -10_000 })], { targets: [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-10', amount: 50_000 }] });
    expect(r.reps[0]).toMatchObject({ targetMet: false, commission: -99, carryOut: -99 });
  });

  it('pays nobody for lines without a rep or of a switched-off rep, and lists issues', () => {
    const r = run([line({ odooUserId: null, issues: ['ไม่พบพนักงานขาย'] }), line({ odooUserId: 9, repName: 'ปิด' }), line({ pricelistId: 42, pricelistName: 'ใหม่' })], { inactive: new Set([9]) });
    expect(r.unassignedBase).toBe(200_000);
    expect(r.reps.map((x) => x.odooUserId)).toEqual([8]);
    expect(r.issues.map((i) => i.message)).toEqual(expect.arrayContaining(['ไม่พบพนักงานขาย', expect.stringContaining('pricelist "ใหม่"')]));
  });

  it('shows reps that only have an adjustment, named from Odoo when unknown', () => {
    const r = run([], { adjustments: [{ odooUserId: 77, amount: 500 }], reps: [] });
    expect(r.reps[0]).toMatchObject({ odooUserId: 77, repName: 'Odoo user #77', payable: 500, lines: 0 });
  });
});

describe('calculateRun breakdown', () => {
  it('splits what each rep collected into counted and not counted, with the reason', () => {
    const r = run([
      line({}), // counted 100,000
      line({ brand: 'X' }), // no rate
      line({ overdueDays: 40 }), // beyond the last step: 0%
      line({ productId: null, base: 0 }),
      line({ odooUserId: null, invoiceId: null, productId: null, base: 0, gross: 500 }), // deposit, no rep
    ], { credits: [{ id: 1, name: 'RINV/1', date: '2026-10-05', partnerName: 'ร้าน', originName: 'INV/1', odooUserId: 8, repName: 'สมชาย', base: 2_000, gross: 2_140 }] });
    expect(r.reps[0]).toMatchObject({
      base: 300_000, counted: 100_000, commission: 990, commissionBeforeTarget: 990, creditNoteBase: 2_000, creditNoteCount: 1,
      excluded: [{ reason: 'NO_RATE', base: 100_000, lines: 1 }, { reason: 'OVERDUE', base: 100_000, lines: 1 }, { reason: 'NO_PRODUCT', base: 0, lines: 1 }],
    });
    expect(r.notInvoiceGross).toBe(500);
    expect(r.credits).toHaveLength(1);
  });

  it('groups commission by overdue step so the statement can show what the steps did', () => {
    const r = run([line({ overdueDays: 3 }), line({ overdueDays: 12 }), line({ overdueDays: 18 }), line({ overdueDays: 40 })]);
    expect(r.reps[0].steps).toEqual([
      { minDays: 0, maxDays: 10, percent: 110, base: 100_000, lines: 1, beforeStep: 900, commission: 990 },
      { minDays: 11, maxDays: 15, percent: 100, base: 100_000, lines: 1, beforeStep: 900, commission: 900 },
      { minDays: 16, maxDays: 20, percent: 90, base: 100_000, lines: 1, beforeStep: 900, commission: 810 },
      { minDays: null, maxDays: null, percent: 0, base: 100_000, lines: 1, beforeStep: 900, commission: 0 },
    ]);
    expect(stepRangeLabel({ minDays: 121, maxDays: null })).toBe('121 วันขึ้นไป');
    expect(stepRangeLabel(null)).toContain('เกินขั้นสุดท้าย');
  });

  it('keeps the commission earned before a missed target', () => {
    const r = run([line({})], { targets: [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-10', amount: 500_000 }] });
    expect(r.reps[0]).toMatchObject({ commission: 0, commissionBeforeTarget: 990, counted: 100_000 });
  });
});

describe('calculateRun statement', () => {
  const statement = statementSettings({ centralPercent: 5, debtDays: 120, debtPercent: 1 });
  const hold = (over: object) => ({ odooUserId: 8, amount: 100, heldPeriod: '2026-10', releasedPeriod: null, invoiceName: 'INV/9', ...over });

  it('splits commission into the sheet rows by family, price group and cash / credit', () => {
    const r = run([
      line({ paymentKind: 'CASH' }), // PCR retail cash 990
      line({}), // PCR retail credit 990
      line({ pricelistId: 2 }), // PCR wholesale 440
      line({ family: 'TBR', pricelistId: 2 }), // TBR wholesale 330
      line({ family: 'MC', productId: 999 }), // no matching row → อื่นๆ (no rate either: 0, hidden)
    ], { statement, rates: [...RATES, rate({ id: 'wh', family: 'WH', priceGroup: '*', value: 1 })] });
    const rep = r.reps[0];
    expect(rep.summary.map((s) => [s.key, s.amount])).toEqual([
      ['PCR-RETAIL-CASH', 990], ['PCR-RETAIL-CREDIT', 990], ['PCR-WHOLESALE', 440], ['TBR-RETAIL', 0], ['TBR-WHOLESALE', 330], ['WH', 0], ['OTR', 0],
    ]);
    expect(rep.commission).toBe(2750);
    expect(r.lines[0].summaryKey).toBe('PCR-RETAIL-CASH');
  });

  it('works like the sheet: total, minus central 5%, minus overdue holds, plus give-backs', () => {
    const r = run([line({})], { statement, holds: [hold({}), hold({ amount: 40, heldPeriod: '2026-06', releasedPeriod: '2026-10' }), hold({ amount: 999, heldPeriod: '2026-09' })] });
    // 990 commission + 40 given back = 1,030; central 51.50; hold 100 → 878.50
    expect(r.reps[0]).toMatchObject({ commission: 990, debtRelease: 40, subtotal: 1030, central: 51.5, debtHold: 100, payable: 878.5 });
  });

  it('keeps holds and the central fund out of a missed target, and reports holds without a rep', () => {
    const r = run([line({})], { statement, targets: [{ id: 't', sourceId: 's', odooUserId: 8, period: '2026-10', amount: 500_000 }], holds: [hold({}), hold({ odooUserId: null })] });
    expect(r.reps[0]).toMatchObject({ commission: 0, central: 0, debtHold: 100, payable: 0, carryOut: -100 });
    expect(r.issues.map((i) => i.message)).toContain('ลูกหนี้ค้างชำระ INV/9 ไม่มีพนักงานขาย จึงไม่ได้หักใคร');
  });

  it('shows the other row only when it has commission, and skips holds of switched-off reps', () => {
    const r = run([line({ family: 'BT' })], { statement, rates: [rate({ family: '*', priceGroup: '*', value: 1 })], inactive: new Set([9]), holds: [hold({ odooUserId: 9 })] });
    expect(r.reps[0].summary.at(-1)).toMatchObject({ key: 'OTHER', label: 'คอมมิชชั่นอื่นๆ', amount: 1100 });
    expect(r.reps.map((x) => x.odooUserId)).toEqual([8]);
  });

  it('puts a pricelist row first and shows its base and the rates used', () => {
    const rows = [{ key: 'PL7', label: 'ราคาส่งพิเศษ', family: '*', priceGroup: '*' as const, paymentKind: '*' as const, pricelistId: 7, pricelistName: 'ราคาส่งพิเศษ' }];
    const r = run([line({ pricelistId: 7, pricelistName: 'ราคาส่งพิเศษ' }), line({})], {
      statement: { ...statement, summaryLines: rows }, rates: [...RATES, rate({ id: 'pl7', brand: '*', family: '*', priceGroup: '*', odooPricelistId: 7, value: 0.5 })],
    });
    expect(r.reps[0].summary).toEqual([
      { key: 'PL7', label: 'ราคาส่งพิเศษ', amount: 550, base: 100_000, rates: ['0.5%'] },
      { key: 'OTHER', label: 'คอมมิชชั่นอื่นๆ', amount: 990, base: 100_000, rates: ['0.9%'] },
    ]);
    // Pricelist 7 is not grouped, but a rate and a row name it, so no grouping warning.
    expect(r.issues.some((i) => i.message.includes('ราคาส่งพิเศษ'))).toBe(false);
  });
});
