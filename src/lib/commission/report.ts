/**
 * Groupings for the commission reports: collected cash per receipt × invoice (what accounting checks
 * against the bank), and sales / collections per rep × price group × product family.
 */
import type { CommissionPricelist, LedgerLine, PriceGroup } from './types';

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
 * Totals per rep × price group × product family. `special` is the part sold on special-price
 * pricelists. Lines whose pricelist is not mapped land in "UNMAPPED".
 */
export function byRepAndGroup(lines: readonly LedgerLine[], pricelists: readonly CommissionPricelist[]): RepGroupRow[] {
  const pl = new Map(pricelists.map((p) => [p.odooPricelistId, p]));
  const map = new Map<string, RepGroupRow>();
  for (const l of lines) {
    if (l.productId === null) continue;
    const p = l.pricelistId !== null ? pl.get(l.pricelistId) : undefined;
    const priceGroup = p?.priceGroup ?? 'UNMAPPED';
    const family = [l.brand, l.family].filter(Boolean).join('-') || 'ไม่มีหมวด';
    const key = `${l.odooUserId ?? 'none'}|${priceGroup}|${family}`;
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
