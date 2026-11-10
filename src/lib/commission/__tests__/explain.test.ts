import { describe, expect, it } from 'vitest';
import { lineFormula, rateScope } from '../explain';
import type { CommissionRate, LedgerLine, LineResult } from '../types';

const line = (over: Partial<LedgerLine> = {}): LedgerLine => ({
  kind: 'COLLECTION', originPeriod: '2026-11', lineKey: 'P1:R1:L1', receiptName: 'R', cashDate: '2026-11-05', partnerName: 'ร้าน', invoiceId: 1, invoiceName: 'INV/1',
  invoiceDate: '2026-10-01', dueDate: '2026-10-30', overdueDays: 6, paymentKind: 'CREDIT', odooUserId: -12, repName: 'Wit', ownerFrom: 'tag', pricelistId: 4, pricelistName: 'ราคาปลีก',
  pricelistFrom: 'order', productId: 9, productName: 'ยาง A', brand: 'AT', family: 'PCR', qty: 4, base: 100_000, gross: 107_000, issues: [], ...over,
});
const rate = (over: Partial<CommissionRate> = {}): CommissionRate => ({
  id: 'r1', sourceId: 's', brand: 'AT', family: 'PCR', priceGroup: '*', odooPricelistId: 4, pricelistName: 'ราคาปลีก', odooProductId: null, productName: null,
  kind: 'PERCENT', value: 0.9, validFrom: '2026-09-21', validTo: null, note: null, ...over,
});
const result = (over: Partial<LineResult> = {}): LineResult => ({
  lineKey: 'P1:R1:L1', odooUserId: -12, rateId: 'r1', rateLabel: '0.9%', specialPercent: 100, stepPercent: 110, commission: 990, beforeStep: 900, stepRange: { minDays: 0, maxDays: 10 }, ...over,
});

describe('lineFormula', () => {
  it('names the matched rule and spells out base × rate × step', () => {
    expect(lineFormula(line(), result(), [rate()])).toMatchObject({
      rule: 'AT-PCR · pricelist ราคาปลีก · 0.9% (เริ่ม 2026-09-21)',
      steps: '100,000.00 × 0.9% = 900.00 × 110% (เกินดิว 6 วัน · ขั้น 0–10 วัน) = 990.00',
      excluded: undefined,
      terms: [{ label: 'ยอดก่อน VAT', value: '100,000.00' }, { label: 'อัตรา', value: '0.9%' }, { label: 'เกินดิว 6 วัน · ขั้น 0–10 วัน', value: '110%', tone: 'up' }],
      result: '990.00',
    });
  });

  it('per-unit rates with a special price', () => {
    const f = lineFormula(line(), result({ rateLabel: '฿15/หน่วย', specialPercent: 50, stepPercent: 100, commission: 30, beforeStep: 30 }), [rate({ kind: 'PER_UNIT', value: 15, family: 'TBR', brand: '*', odooPricelistId: null, pricelistName: null })]);
    expect(f.rule).toContain('ทุกยี่ห้อ-TBR · ทุกกลุ่มราคา · ฿15/หน่วย');
    expect(f.terms?.map((t) => t.value)).toEqual(['4 หน่วย', '฿15', '50%', '100%']);
    expect(f.steps).toBe('4 หน่วย × ฿15 = 60.00 × 50% (ราคาพิเศษ) = 30.00 × 100% (เกินดิว 6 วัน · ขั้น 0–10 วัน) = 30.00');
  });

  it('says why a line earned nothing', () => {
    expect(lineFormula(line(), result({ rateId: null, rateLabel: '—', commission: 0 }), [])).toMatchObject({ rule: 'ไม่พบอัตราที่ตรงกับสินค้า / pricelist นี้', excluded: 'ไม่มีอัตราค่าคอม' });
    expect(lineFormula(line(), result({ stepPercent: 0, commission: 0, stepRange: null }), [rate()]).steps).toContain('× 0% (เกินดิว 6 วัน · ขั้น เกินขั้นสุดท้าย');
    expect(lineFormula(line(), undefined, [])).toEqual({ rule: 'ยังไม่คำนวณ', steps: '—' });
  });

  it('says when no overdue steps are set up (100%)', () => {
    const f = lineFormula(line(), result({ stepPercent: 100, commission: 900, stepRange: null, noSteps: true }), [rate()]);
    expect(f.steps).toBe('100,000.00 × 0.9% = 900.00 × 100% (เกินดิว 6 วัน · ไม่ได้ตั้งขั้นบันได) = 900.00');
    expect(f.terms?.at(-1)).toEqual({ label: 'เกินดิว 6 วัน · ไม่ได้ตั้งขั้นบันได', value: '100%', tone: undefined });
  });

  it('describes a product override', () => {
    expect(rateScope(rate({ odooProductId: 9, productName: 'ยาง A' }))).toBe('สินค้า ยาง A');
  });
});
