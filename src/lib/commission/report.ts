/**
 * Groupings for the commission reports: collected cash per receipt × invoice (what accounting checks
 * against the bank), and sales / collections per rep × price group × product family.
 */
import { excludedReasonOf } from './calc';
import type { CommissionPricelist, LedgerLine, LineResult, PriceGroup } from './types';

const round2 = (v: number) => Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;

export type InvoiceRow = {
  key: string;
  kind: LedgerLine['kind'];
  cashDate: string;
  receiptName: string;
  partnerName: string;
  invoiceName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  overdueDays: number | null;
  repName: string | null;
  odooUserId: number | null;
  pricelists: string[];
  families: string[];
  base: number;
  gross: number;
  lines: number;
  issues: string[];
};

/** One row per receipt × invoice (lines of the same invoice paid by the same receipt are summed). */
export function groupByInvoice(lines: readonly LedgerLine[]): InvoiceRow[] {
  const map = new Map<string, InvoiceRow>();
  for (const l of lines) {
    const key = `${l.kind}:${l.lineKey.split(':').slice(0, 2).join(':')}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key, kind: l.kind, cashDate: l.cashDate, receiptName: l.receiptName, partnerName: l.partnerName, invoiceName: l.invoiceName, invoiceDate: l.invoiceDate,
        dueDate: l.dueDate, overdueDays: l.overdueDays, repName: l.repName, odooUserId: l.odooUserId, pricelists: [], families: [], base: 0, gross: 0, lines: 0, issues: [],
      };
      map.set(key, row);
    }
    row.base += l.base;
    row.gross += l.gross;
    row.lines += 1;
    if (l.pricelistName && !row.pricelists.includes(l.pricelistName)) row.pricelists.push(l.pricelistName);
    const family = [l.brand, l.family].filter(Boolean).join('-');
    if (family && !row.families.includes(family)) row.families.push(family);
    for (const issue of l.issues) if (!row.issues.includes(issue)) row.issues.push(issue);
  }
  return [...map.values()].map((r) => ({ ...r, base: round2(r.base), gross: round2(r.gross) }))
    .sort((a, b) => a.cashDate.localeCompare(b.cashDate) || a.receiptName.localeCompare(b.receiptName));
}

export type InvoiceCommissionRow = {
  key: string;
  kind: LedgerLine['kind'];
  invoiceId: number | null;
  invoiceName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  partnerName: string;
  repName: string | null;
  odooUserId: number | null;
  /** Receipts / cash-ins that paid this invoice in the period, and the latest cash date. */
  receipts: string[];
  cashDate: string;
  overdueDays: number | null;
  families: string[];
  qty: number;
  base: number;
  gross: number;
  /** Part of `base` that earned commission, and the commission (before the target gate). */
  counted: number;
  commission: number;
  lines: number;
};

type LineOutcome = Pick<LineResult, 'rateId' | 'stepPercent' | 'commission'>;

/**
 * One row per invoice (all receipts and product lines of it in the period summed): what makes up a
 * rep's collected total and commission, so "ยอดเก็บ 1 ล้าน" can be traced to its invoices. Cash not
 * applied to an invoice keeps one row per receipt; RETRO lines stay apart. Largest base first.
 */
/** Row key of a line in `commissionByInvoice` (kind + invoice, or kind + receipt for cash not on an invoice). */
export const invoiceKeyOf = (l: Pick<LedgerLine, 'kind' | 'invoiceId' | 'lineKey'>): string => `${l.kind}:${l.invoiceId ?? l.lineKey.split(':').slice(0, 2).join(':')}`;

export function commissionByInvoice(lines: readonly LedgerLine[], results: ReadonlyMap<string, LineOutcome>): InvoiceCommissionRow[] {
  const map = new Map<string, InvoiceCommissionRow>();
  for (const l of lines) {
    const key = invoiceKeyOf(l);
    let row = map.get(key);
    if (!row) {
      row = {
        key, kind: l.kind, invoiceId: l.invoiceId, invoiceName: l.invoiceName, invoiceDate: l.invoiceDate, dueDate: l.dueDate, partnerName: l.partnerName,
        repName: l.repName, odooUserId: l.odooUserId, receipts: [], cashDate: l.cashDate, overdueDays: l.overdueDays, families: [], qty: 0, base: 0, gross: 0, counted: 0, commission: 0, lines: 0,
      };
      map.set(key, row);
    }
    if (!row.receipts.includes(l.receiptName)) row.receipts.push(l.receiptName);
    if (l.cashDate > row.cashDate) {
      row.cashDate = l.cashDate;
      row.overdueDays = l.overdueDays;
    }
    const family = [l.brand, l.family].filter(Boolean).join('-');
    if (family && !row.families.includes(family)) row.families.push(family);
    const r = results.get(l.lineKey);
    row.qty += l.productId !== null ? l.qty : 0;
    row.base += l.base;
    row.gross += l.gross;
    if (r && excludedReasonOf(l, r) === null) row.counted += l.base;
    row.commission += r?.commission ?? 0;
    row.lines += 1;
  }
  return [...map.values()]
    .map((r) => ({ ...r, qty: Math.round(r.qty * 100) / 100, base: round2(r.base), gross: round2(r.gross), counted: round2(r.counted), commission: round2(r.commission) }))
    .sort((a, b) => b.base - a.base || (a.invoiceName ?? '').localeCompare(b.invoiceName ?? ''));
}

export type RepGroupRow = {
  odooUserId: number | null;
  repName: string;
  priceGroup: PriceGroup | 'UNMAPPED';
  family: string;
  base: number;
  gross: number;
  qty: number;
  special: number;
};

/**
 * The rep × price group × family bucket of a line (`key` = "<rep id or none>|<group>|<family>"), as
 * used by `byRepAndGroup`; null for cash not tied to a product (not part of sales).
 */
export function repGroupOf(l: LedgerLine, pricelists: ReadonlyMap<number, CommissionPricelist>): { key: string; priceGroup: PriceGroup | 'UNMAPPED'; family: string } | null {
  if (l.productId === null) return null;
  const priceGroup = (l.pricelistId !== null ? pricelists.get(l.pricelistId)?.priceGroup : undefined) ?? 'UNMAPPED';
  const family = [l.brand, l.family].filter(Boolean).join('-') || 'ไม่มีหมวด';
  return { key: `${l.odooUserId ?? 'none'}|${priceGroup}|${family}`, priceGroup, family };
}

/**
 * Totals per rep × price group × product family. `special` is the part sold on special-price
 * pricelists. Lines whose pricelist is not mapped land in "UNMAPPED".
 */
export function byRepAndGroup(lines: readonly LedgerLine[], pricelists: readonly CommissionPricelist[]): RepGroupRow[] {
  const pl = new Map(pricelists.map((p) => [p.odooPricelistId, p]));
  const map = new Map<string, RepGroupRow>();
  for (const l of lines) {
    const group = repGroupOf(l, pl);
    if (!group) continue;
    const { key, priceGroup, family } = group;
    const p = l.pricelistId !== null ? pl.get(l.pricelistId) : undefined;
    let row = map.get(key);
    if (!row) {
      row = { odooUserId: l.odooUserId, repName: l.repName ?? 'ไม่มีพนักงานขาย', priceGroup, family, base: 0, gross: 0, qty: 0, special: 0 };
      map.set(key, row);
    }
    row.base += l.base;
    row.gross += l.gross;
    row.qty += l.qty;
    if (p?.isSpecial) row.special += l.base;
  }
  return [...map.values()].map((r) => ({ ...r, base: round2(r.base), gross: round2(r.gross), qty: Math.round(r.qty * 100) / 100, special: round2(r.special) }))
    .sort((a, b) => a.repName.localeCompare(b.repName) || a.priceGroup.localeCompare(b.priceGroup) || a.family.localeCompare(b.family));
}

/** Sum of base per rep (for subtotals). */
export function totalsByRep(rows: readonly RepGroupRow[]): Map<string, { base: number; gross: number }> {
  const out = new Map<string, { base: number; gross: number }>();
  for (const r of rows) {
    const t = out.get(r.repName) ?? { base: 0, gross: 0 };
    t.base = round2(t.base + r.base);
    t.gross = round2(t.gross + r.gross);
    out.set(r.repName, t);
  }
  return out;
}
