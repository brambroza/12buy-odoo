/**
 * Plain-Thai explanation of how one collected line's commission was worked out, for the run
 * drill-down: which rate rule matched, then base × rate × special-price % × overdue step = commission.
 * Pure; reads only the line, its result and the rates the run was calculated with.
 */
import { excludedReasonOf, stepRangeLabel } from './calc';
import { EXCLUDED_LABELS, PRICE_GROUP_LABELS, type CommissionRate, type LedgerLine, type LineResult } from './types';

const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const units = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 });

export type LineFormula = {
  /** The rate rule that matched, e.g. "AT-PCR · pricelist ราคาปลีก · 0.9% (เริ่ม 2026-09-21)". */
  rule: string;
  /** The arithmetic, e.g. "100,000.00 × 0.9% = 900.00 × 110% (เกินดิว 0–10 วัน) = 990.00". */
  steps: string;
  /** Set when the line earned nothing: why. */
  excluded?: string;
};

/** Which lines a rate applies to, in words. */
export function rateScope(rate: Pick<CommissionRate, 'brand' | 'family' | 'priceGroup' | 'pricelistName' | 'odooPricelistId' | 'productName' | 'odooProductId'>): string {
  if (rate.odooProductId !== null) return `สินค้า ${rate.productName ?? `#${rate.odooProductId}`}`;
  const product = `${rate.brand === '*' ? 'ทุกยี่ห้อ' : rate.brand}-${rate.family === '*' ? 'ทุกกลุ่ม' : rate.family}`;
  const price = rate.odooPricelistId !== null ? `pricelist ${rate.pricelistName ?? `#${rate.odooPricelistId}`}` : rate.priceGroup === '*' ? 'ทุกกลุ่มราคา' : PRICE_GROUP_LABELS[rate.priceGroup];
  return `${product} · ${price}`;
}

export function lineFormula(line: LedgerLine, result: LineResult | undefined, rates: readonly CommissionRate[]): LineFormula {
  if (!result) return { rule: 'ยังไม่คำนวณ', steps: '—' };
  const reason = excludedReasonOf(line, result);
  const rate = result.rateId ? rates.find((r) => r.id === result.rateId) : undefined;
  if (!result.rateId) {
    return { rule: line.productId === null ? 'ไม่มีบรรทัดสินค้า' : 'ไม่พบอัตราที่ตรงกับสินค้า / pricelist นี้', steps: `${money.format(line.base)} × — = 0.00`, excluded: reason ? EXCLUDED_LABELS[reason] : undefined };
  }
  const rule = rate
    ? `${rateScope(rate)} · ${result.rateLabel}${rate.validFrom ? ` (เริ่ม ${rate.validFrom}${rate.validTo ? ` ถึง ${rate.validTo}` : ''})` : ''}`
    : result.rateLabel;
  const basic = rate?.kind === 'PER_UNIT' || result.rateLabel.includes('/หน่วย')
    ? `${units.format(line.qty)} หน่วย × ${result.rateLabel.replace('/หน่วย', '')}`
    : `${money.format(line.base)} × ${result.rateLabel}`;
  const basicAmount = rate
    ? (rate.kind === 'PERCENT' ? (line.base * rate.value) / 100 : line.qty * rate.value)
    : result.specialPercent ? ((result.beforeStep ?? 0) * 100) / result.specialPercent : 0;
  const parts = [`${basic} = ${money.format(basicAmount)}`];
  if (result.specialPercent !== 100) parts.push(`× ${result.specialPercent}% (ราคาพิเศษ) = ${money.format((basicAmount * result.specialPercent) / 100)}`);
  const days = line.overdueDays ?? 0;
  const range = result.stepRange === undefined ? '' : ` · ขั้น ${stepRangeLabel(result.stepRange)}`;
  parts.push(`× ${result.stepPercent}% (เกินดิว ${days} วัน${range}) = ${money.format(result.commission)}`);
  return { rule, steps: parts.join(' '), excluded: reason ? EXCLUDED_LABELS[reason] : undefined };
}
