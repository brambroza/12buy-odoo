/**
 * Per-rep commission statement ("สรุปค่าคอมมิชชั่น"): which statement row each commission line
 * counts in, the company's statement settings, and the overdue-invoice holds
 * ("หัก ลูกหนี้ค้างชำระ" / "คืนเงินลูกหนี้ค้างชำระ"). Pure, no I/O.
 */
import { overdueDays } from './period';
import type { DebtHold, PaymentKind, PriceGroup, StatementSettings, SummaryLine } from './types';

/** Rows of the client's statement sheet, used until the company saves its own. */
export const DEFAULT_SUMMARY_LINES: SummaryLine[] = [
  { key: 'PCR-RETAIL-CASH', label: 'คอมมิชชั่นค้าปลีก PCR เงินสด', family: 'PCR', priceGroup: 'RETAIL', paymentKind: 'CASH' },
  { key: 'PCR-RETAIL-CREDIT', label: 'คอมมิชชั่นค้าปลีก PCR เครดิต', family: 'PCR', priceGroup: 'RETAIL', paymentKind: 'CREDIT' },
  { key: 'PCR-WHOLESALE', label: 'คอมมิชชั่นค้าส่ง PCR', family: 'PCR', priceGroup: 'WHOLESALE', paymentKind: '*' },
  { key: 'TBR-RETAIL', label: 'คอมมิชชั่นค้าปลีก TBR', family: 'TBR', priceGroup: 'RETAIL', paymentKind: '*' },
  { key: 'TBR-WHOLESALE', label: 'คอมมิชชั่นค้าส่ง TBR', family: 'TBR', priceGroup: 'WHOLESALE', paymentKind: '*' },
  { key: 'WH', label: 'คอมมิชชั่น กระทะล้อ', family: 'WH', priceGroup: '*', paymentKind: '*' },
  { key: 'OTR', label: 'คอมมิชชั่น OTR', family: 'OTR', priceGroup: '*', paymentKind: '*' },
];

/** Row for commission that matches no configured row (shown only when not zero). */
export const OTHER_SUMMARY: Pick<SummaryLine, 'key' | 'label'> = { key: 'OTHER', label: 'คอมมิชชั่นอื่นๆ' };

export const DEFAULT_STATEMENT: StatementSettings = { summaryLines: DEFAULT_SUMMARY_LINES, centralPercent: 5, debtDays: 120, debtPercent: 0 };

/** Statement settings of a company; the default rows apply while it has saved none. */
export function statementSettings(source: Partial<StatementSettings>): StatementSettings {
  return {
    summaryLines: source.summaryLines?.length ? source.summaryLines : DEFAULT_SUMMARY_LINES,
    centralPercent: Number(source.centralPercent ?? DEFAULT_STATEMENT.centralPercent),
    debtDays: Number(source.debtDays ?? DEFAULT_STATEMENT.debtDays),
    debtPercent: Number(source.debtPercent ?? DEFAULT_STATEMENT.debtPercent),
  };
}

const same = (rule: string, value: string) => rule === '*' || rule.trim().toUpperCase() === value.trim().toUpperCase();

/** Key of the first statement row matching a line, or `OTHER`. */
export function summaryKeyOf(rows: readonly SummaryLine[], line: { family: string; paymentKind: PaymentKind; pricelistId?: number | null }, group: PriceGroup | null): string {
  const row = rows.find((r) => same(r.family, line.family) && (r.pricelistId == null || r.pricelistId === line.pricelistId)
    && (r.priceGroup === '*' || r.priceGroup === group) && (r.paymentKind === '*' || r.paymentKind === line.paymentKind));
  return row?.key ?? OTHER_SUMMARY.key;
}

/** An unpaid customer invoice read from Odoo, with its rep. */
export type OpenInvoice = {
  invoiceId: number;
  invoiceName: string;
  partnerName: string;
  dueDate: string;
  odooUserId: number | null;
  repName: string | null;
  /** Unpaid amount before VAT. */
  residualBase: number;
};

export type NewHold = Omit<DebtHold, 'id' | 'sourceId'>;

const round2 = (value: number) => Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;

/**
 * Holds and give-backs for `period`:
 * - an open invoice more than `debtDays` past due on `asOf` (the period's last day) is held once:
 *   `debtPercent`% of its unpaid amount before VAT, booked in this period;
 * - an earlier hold is given back in this period when its invoice is now fully paid and its cash
 *   came in this period (`collectedPaid`).
 * `existing` must not contain this period's own holds or give-backs (they are recomputed).
 */
export function planDebt(input: {
  period: string;
  asOf: string;
  settings: Pick<StatementSettings, 'debtDays' | 'debtPercent'>;
  existing: readonly Pick<DebtHold, 'id' | 'invoiceId' | 'heldPeriod' | 'releasedPeriod'>[];
  overdue: readonly OpenInvoice[];
  collectedPaid: ReadonlySet<number>;
}): { holds: NewHold[]; releaseIds: string[] } {
  const known = new Set(input.existing.map((h) => h.invoiceId));
  const holds: NewHold[] = [];
  if (input.settings.debtPercent > 0) {
    for (const invoice of input.overdue) {
      if (known.has(invoice.invoiceId) || (overdueDays(input.asOf, invoice.dueDate) ?? 0) <= input.settings.debtDays) continue;
      const amount = round2((invoice.residualBase * input.settings.debtPercent) / 100);
      if (amount <= 0) continue;
      known.add(invoice.invoiceId);
      holds.push({ ...invoice, percent: input.settings.debtPercent, amount, heldPeriod: input.period, releasedPeriod: null });
    }
  }
  const releaseIds = input.existing
    .filter((h) => h.releasedPeriod === null && h.heldPeriod < input.period && input.collectedPaid.has(h.invoiceId))
    .map((h) => h.id);
  return { holds, releaseIds };
}
