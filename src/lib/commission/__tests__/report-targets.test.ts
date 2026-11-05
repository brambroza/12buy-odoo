import { describe, expect, it } from 'vitest';
import { byRepAndGroup, groupByInvoice, totalsByRep } from '../report';
import { parseTargetLines } from '../targets';
import type { CommissionPricelist, LedgerLine } from '../types';

const line = (over: Partial<LedgerLine>): LedgerLine => ({
  kind: 'COLLECTION', originPeriod: '2026-10', lineKey: 'P1:R1:L1', receiptName: 'PBNK/1', cashDate: '2026-10-08', partnerName: 'ร้าน', invoiceId: 1, invoiceName: 'INV/1',
  invoiceDate: '2026-09-01', dueDate: '2026-10-01', overdueDays: 7, paymentKind: 'CREDIT', odooUserId: 8, repName: 'สมชาย', ownerFrom: 'invoice', pricelistId: 1, pricelistName: 'ปลีก', pricelistFrom: 'order',
  productId: 501, productName: 'A', brand: 'AUSTONE', family: 'PCR', qty: 1, base: 100, gross: 107, issues: [], ...over,
});
const PL: CommissionPricelist[] = [
  { id: 'a', sourceId: 's', odooPricelistId: 1, name: 'ปลีก', priceGroup: 'RETAIL', isSpecial: false, specialPercent: 50 },
  { id: 'b', sourceId: 's', odooPricelistId: 2, name: 'โปร', priceGroup: 'RETAIL', isSpecial: true, specialPercent: 50 },
];

describe('groupByInvoice', () => {
  it('sums the lines of one receipt × invoice and keeps RETRO apart', () => {
    const rows = groupByInvoice([
      line({}), line({ lineKey: 'P1:R1:L2', family: 'TBR', pricelistName: 'โปร', issues: ['x'] }),
      line({ lineKey: 'P1:R2:L3', invoiceName: 'INV/2', cashDate: '2026-10-01' }), line({ kind: 'RETRO', base: -100 }),
    ]);
    expect(rows).toHaveLength(3);
    const first = rows.find((r) => r.key === 'COLLECTION:P1:R1')!;
    expect(first).toMatchObject({ base: 200, gross: 214, lines: 2, pricelists: ['ปลีก', 'โปร'], families: ['AUSTONE-PCR', 'AUSTONE-TBR'], issues: ['x'] });
    expect(rows[0].invoiceName).toBe('INV/2');
  });
});

describe('byRepAndGroup', () => {
  it('totals per rep × price group × family and tracks special-price sales', () => {
    const rows = byRepAndGroup([line({}), line({ pricelistId: 2, base: 50 }), line({ pricelistId: 9 }), line({ odooUserId: null, repName: null }), line({ productId: null })], PL);
    expect(rows.find((r) => r.repName === 'สมชาย' && r.priceGroup === 'RETAIL')).toMatchObject({ base: 150, special: 50, qty: 2 });
    expect(rows.find((r) => r.priceGroup === 'UNMAPPED')).toBeTruthy();
    expect(rows.find((r) => r.repName === 'ไม่มีพนักงานขาย')).toBeTruthy();
    expect(totalsByRep(rows).get('สมชาย')?.base).toBe(250);
  });
});

describe('parseTargetLines', () => {
  const reps = [{ odooUserId: 8, name: 'สมชาย ใจดี' }, { odooUserId: 9, name: 'สมหญิง' }];
  it('reads Excel tab, comma and semicolon lines by name or Odoo id, skipping a header', () => {
    const r = parseTargetLines('ชื่อ\tเป้า\nสมชาย ใจดี\t500,000\n9, 350000\nสมหญิง;1.5', reps);
    expect(r.errors).toEqual([]);
    expect([...r.values]).toEqual([[8, 500_000], [9, 1.5]]);
  });
  it('reports unknown reps, bad and negative amounts', () => {
    const r = parseTargetLines('x\t1\nสมชาย ใจดี\tabc\nสมหญิง\t-5\nonlyname', reps);
    expect(r.errors).toHaveLength(4);
    expect(r.values.size).toBe(0);
  });
});
