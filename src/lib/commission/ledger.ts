/**
 * Turns what was read from Odoo (receipts, their reconciliations with invoices, invoice lines,
 * sale orders, customers, products) into ledger lines: one row per receipt × invoice line with
 * the share of cash before and after VAT, the rep, the pricelist and the days paid after the due date.
 * Pure so every allocation rule is unit-tested; `odoo.ts` does the reading.
 */
import { overdueDays } from './period';
import type { LedgerLine, OwnerFrom, PaymentKind, PricelistFrom } from './types';

type Ref = [number, string] | null;

/** Cash that reached the bank: a customer payment or a bank statement line reconciled directly. */
export type RawReceipt = { key: string; name: string; cashDate: string; partnerName: string };
/** Part of a receipt applied to a receivable line (`account.partial.reconcile`). */
export type RawPartial = { id: number; receiptKey: string; debitLineId: number; amount: number };
export type RawInvoice = {
  id: number;
  name: string;
  invoiceDate: string | null;
  dueDate: string | null;
  amountTotal: number;
  partnerId: number | null;
  partnerName: string;
  invoiceUser: Ref;
};
export type RawInvoiceLine = { id: number; moveId: number; productId: number | null; productName: string; quantity: number; subtotal: number; total: number; saleLineIds: number[] };

export type LedgerInput = {
  period: string;
  receipts: RawReceipt[];
  partials: RawPartial[];
  /** Receivable line id → id of the move it belongs to. */
  debitLineMove: Map<number, number>;
  /** Posted customer invoices by move id (other moves are not invoices). */
  invoices: Map<number, RawInvoice>;
  invoiceLines: RawInvoiceLine[];
  /** sale.order.line id → sale.order id. */
  saleLineOrder: Map<number, number>;
  orders: Map<number, { pricelist: Ref; user: Ref }>;
  /** Customers with their "Sale …" tags (rep key + rep name, in Odoo's order). */
  partners: Map<number, { pricelist: Ref; user: Ref; tags?: [number, string][] }>;
  /** Odoo user id → rep key of the "Sale …" tag with the same name (so a salesperson fallback lands on the same rep). */
  userReps?: Map<number, [number, string]>;
  /** product id → category name (last segment, e.g. `YK-PCR`). */
  productCategory: Map<number, string>;
};

export const ISSUE = {
  notInvoice: 'เงินเข้าตัดกับรายการที่ไม่ใช่ใบแจ้งหนี้ (มัดจำ/ปรับปรุง) ไม่คิดค่าคอม',
  noRep: 'ไม่พบเซลล์ (ลูกค้าไม่มี tag Sale และไม่มี Salesperson)',
  noRepTag: 'ลูกค้าไม่มี tag Sale ใช้ Salesperson ใน Odoo แทน',
  multiRepTag: (names: string[]) => `ลูกค้ามีหลาย tag Sale (${names.join(', ')}) ใช้ tag แรก`,
  pricelistFromPartner: 'บิลไม่มีใบสั่งขาย ใช้ pricelist ประจำลูกค้า',
  noPricelist: 'ไม่พบ pricelist',
  noDueDate: 'ใบแจ้งหนี้ไม่มีวันครบกำหนด นับเกินดิว 0 วัน',
  noProductLines: 'ใบแจ้งหนี้ไม่มีรายการสินค้า',
} as const;

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
};

/** `All / Saleable / YK-PCR` → `YK-PCR`. */
export function lastCategorySegment(name: string): string {
  return name.split('/').map((s) => s.trim()).filter(Boolean).at(-1) ?? '';
}

/** Brand and family from a category name: `YK-PCR` → YK / PCR; no dash → the name is the brand. */
export function splitCategory(name: string): { brand: string; family: string } {
  const segment = lastCategorySegment(name).toUpperCase();
  const dash = segment.lastIndexOf('-');
  if (dash <= 0) return { brand: segment, family: '' };
  return { brand: segment.slice(0, dash).trim(), family: segment.slice(dash + 1).trim() };
}

/**
 * Cash sale when the invoice is due the day it is issued (payment term "Immediate Payment", or none),
 * credit sale otherwise.
 */
export function paymentKindOf(invoice: Pick<RawInvoice, 'invoiceDate' | 'dueDate'>): PaymentKind {
  return !invoice.dueDate || !invoice.invoiceDate || invoice.dueDate <= invoice.invoiceDate ? 'CASH' : 'CREDIT';
}

/**
 * Rep keys: a rep is a customer tag "Sale …" (the real salesperson; key = −tag id) or, for customers
 * without one, an Odoo user (key = user id). Negative keys keep the two apart in every table.
 */
export const tagRepKey = (tagId: number) => -tagId;
export const isTagRep = (key: number) => key < 0;
/** `Sale Tip` / `sales Tip` → `Tip`; null when the tag is not a rep tag. */
export function repTagName(tagName: string): string | null {
  const match = /^sales?\b\s*(.*)$/i.exec(tagName.trim());
  return match && match[1].trim() ? match[1].trim() : null;
}

/** The Odoo salesperson: the invoice's, else the first sale order's, else the customer's. */
function salespersonOf(invoice: RawInvoice, lines: RawInvoiceLine[], input: Pick<LedgerInput, 'saleLineOrder' | 'orders' | 'partners'>): { user: Ref; from: OwnerFrom } {
  if (invoice.invoiceUser) return { user: invoice.invoiceUser, from: 'invoice' };
  for (const line of lines) {
    const orderId = line.saleLineIds.map((id) => input.saleLineOrder.get(id)).find((id) => id !== undefined);
    const user = orderId !== undefined ? input.orders.get(orderId)?.user : null;
    if (user) return { user, from: 'order' };
  }
  const partnerUser = invoice.partnerId ? input.partners.get(invoice.partnerId)?.user : null;
  return partnerUser ? { user: partnerUser, from: 'partner' } : { user: null, from: 'none' };
}

/**
 * Rep of an invoice: the customer's first "Sale …" tag; a customer without one falls back to the
 * Odoo salesperson, mapped to the tag rep of the same name when there is one.
 */
export function ownerOf(invoice: RawInvoice, lines: RawInvoiceLine[], input: Pick<LedgerInput, 'saleLineOrder' | 'orders' | 'partners' | 'userReps'>): { user: Ref; from: OwnerFrom; issue?: string } {
  const tags = invoice.partnerId ? input.partners.get(invoice.partnerId)?.tags ?? [] : [];
  if (tags.length) return { user: tags[0], from: 'tag', issue: tags.length > 1 ? ISSUE.multiRepTag(tags.map((t) => t[1])) : undefined };
  const person = salespersonOf(invoice, lines, input);
  if (!person.user) return person;
  return { user: input.userReps?.get(person.user[0]) ?? person.user, from: person.from, issue: ISSUE.noRepTag };
}

/** Pricelist of an invoice line: its sale order's, else the customer's default one. */
function pricelistOf(invoice: RawInvoice, line: RawInvoiceLine, input: LedgerInput): { pricelist: Ref; from: PricelistFrom } {
  const orderId = line.saleLineIds.map((id) => input.saleLineOrder.get(id)).find((id) => id !== undefined);
  const fromOrder = orderId !== undefined ? input.orders.get(orderId)?.pricelist : null;
  if (fromOrder) return { pricelist: fromOrder, from: 'order' };
  const fromPartner = invoice.partnerId ? input.partners.get(invoice.partnerId)?.pricelist : null;
  return fromPartner ? { pricelist: fromPartner, from: 'partner' } : { pricelist: null, from: 'none' };
}

/**
 * Splits every receipt over the invoice lines it paid. For an invoice paid `amount` out of
 * `amount_total`, each product line gets `amount / amount_total` of its subtotal (before VAT),
 * total (with VAT) and quantity. Negative lines (cash discount, coupon) have no product family,
 * so they are spread over the positive lines in proportion instead of being paid on.
 */
export function buildLedger(input: LedgerInput): LedgerLine[] {
  const receipts = new Map(input.receipts.map((r) => [r.key, r]));
  const linesByMove = new Map<number, RawInvoiceLine[]>();
  for (const line of input.invoiceLines) {
    const list = linesByMove.get(line.moveId) ?? [];
    list.push(line);
    linesByMove.set(line.moveId, list);
  }
  const out: LedgerLine[] = [];

  for (const partial of input.partials) {
    const receipt = receipts.get(partial.receiptKey);
    if (!receipt || partial.amount <= 0) continue;
    const moveId = input.debitLineMove.get(partial.debitLineId);
    const invoice = moveId !== undefined ? input.invoices.get(moveId) : undefined;
    const base = {
      kind: 'COLLECTION' as const, originPeriod: input.period, receiptName: receipt.name, cashDate: receipt.cashDate, partnerName: receipt.partnerName,
    };
    if (!invoice) {
      out.push({
        ...base, lineKey: `${receipt.key}:R${partial.id}`, invoiceId: null, invoiceName: null, invoiceDate: null, dueDate: null, overdueDays: null, paymentKind: 'CREDIT',
        odooUserId: null, repName: null, ownerFrom: 'none', pricelistId: null, pricelistName: null, pricelistFrom: 'none',
        productId: null, productName: null, brand: '', family: '', qty: 0, base: 0, gross: round(partial.amount, 2), issues: [ISSUE.notInvoice],
      });
      continue;
    }

    const lines = linesByMove.get(invoice.id) ?? [];
    const owner = ownerOf(invoice, lines, input);
    const days = overdueDays(receipt.cashDate, invoice.dueDate);
    const invoiceIssues: string[] = [];
    if (!owner.user) invoiceIssues.push(ISSUE.noRep);
    if (owner.issue) invoiceIssues.push(owner.issue);
    if (!invoice.dueDate) invoiceIssues.push(ISSUE.noDueDate);
    const common = {
      ...base, invoiceId: invoice.id, invoiceName: invoice.name, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, overdueDays: days ?? 0, paymentKind: paymentKindOf(invoice),
      odooUserId: owner.user?.[0] ?? null, repName: owner.user?.[1] ?? null, ownerFrom: owner.from,
    };
    const ratio = invoice.amountTotal > 0 ? Math.min(1, partial.amount / invoice.amountTotal) : 0;
    const positive = lines.filter((l) => l.subtotal > 0);
    const sumAll = lines.reduce((s, l) => s + l.subtotal, 0);
    const sumPositive = positive.reduce((s, l) => s + l.subtotal, 0);
    const totalAll = lines.reduce((s, l) => s + l.total, 0);
    const totalPositive = positive.reduce((s, l) => s + l.total, 0);

    if (!positive.length || sumPositive <= 0) {
      out.push({
        ...common, lineKey: `${receipt.key}:R${partial.id}`, pricelistId: null, pricelistName: null, pricelistFrom: 'none', productId: null, productName: null,
        brand: '', family: '', qty: 0, base: 0, gross: round(partial.amount, 2), issues: [...invoiceIssues, ISSUE.noProductLines],
      });
      continue;
    }

    const baseFactor = sumAll / sumPositive;
    const grossFactor = totalPositive > 0 ? totalAll / totalPositive : 0;
    const first = out.length;
    for (const line of positive) {
      const pl = pricelistOf(invoice, line, input);
      const issues = [...invoiceIssues];
      if (pl.from === 'partner') issues.push(ISSUE.pricelistFromPartner);
      if (pl.from === 'none') issues.push(ISSUE.noPricelist);
      const category = line.productId !== null ? input.productCategory.get(line.productId) ?? '' : '';
      const { brand, family } = splitCategory(category);
      out.push({
        ...common,
        lineKey: `${receipt.key}:R${partial.id}:L${line.id}`,
        pricelistId: pl.pricelist?.[0] ?? null, pricelistName: pl.pricelist?.[1] ?? null, pricelistFrom: pl.from,
        productId: line.productId, productName: line.productName, brand, family,
        qty: round(line.quantity * ratio, 4),
        base: round(line.subtotal * baseFactor * ratio, 2),
        gross: round(line.total * grossFactor * ratio, 2),
        issues,
      });
    }
    // Rounding each line can leave a satang over or short; put it on the biggest line so the
    // invoice's share matches the cash received to the satang.
    const added = out.slice(first);
    const biggest = added.reduce((a, b) => (b.base > a.base ? b : a));
    biggest.base = round(biggest.base + round(sumAll * ratio, 2) - added.reduce((s, l) => s + l.base, 0), 2);
    biggest.gross = round(biggest.gross + round(Math.min(partial.amount, invoice.amountTotal), 2) - added.reduce((s, l) => s + l.gross, 0), 2);
  }
  return out.sort((a, b) => a.cashDate.localeCompare(b.cashDate) || a.lineKey.localeCompare(b.lineKey));
}

/** Fields compared when a locked period is checked again: a change in either means Odoo moved. */
type Comparable = Pick<LedgerLine, 'lineKey' | 'base' | 'qty' | 'gross'>;

/**
 * Corrections for a locked period: compares what Odoo says now (`fresh`) with what was paid on
 * (`paid`, i.e. the period's own lines plus corrections already booked elsewhere) and returns
 * one RETRO line per changed key carrying the difference. A cancelled payment yields its lines negated.
 */
export function retroDiff(paid: readonly LedgerLine[], fresh: readonly LedgerLine[], lockedPeriod: string): LedgerLine[] {
  const sum = (rows: readonly LedgerLine[]) => {
    const map = new Map<string, { row: LedgerLine; total: Comparable }>();
    for (const row of rows) {
      const current = map.get(row.lineKey);
      if (current) {
        current.total.base += row.base;
        current.total.qty += row.qty;
        current.total.gross += row.gross;
      } else {
        map.set(row.lineKey, { row, total: { lineKey: row.lineKey, base: row.base, qty: row.qty, gross: row.gross } });
      }
    }
    return map;
  };
  const before = sum(paid);
  const after = sum(fresh);
  const out: LedgerLine[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(key);
    const now = after.get(key);
    const delta = {
      base: round((now?.total.base ?? 0) - (was?.total.base ?? 0), 2),
      qty: round((now?.total.qty ?? 0) - (was?.total.qty ?? 0), 4),
      gross: round((now?.total.gross ?? 0) - (was?.total.gross ?? 0), 2),
    };
    if (!delta.base && !delta.qty && !delta.gross) continue;
    const template = (now ?? was)!.row;
    out.push({
      ...template, ...delta, kind: 'RETRO', originPeriod: lockedPeriod,
      issues: [...template.issues.filter((i) => !i.startsWith('ปรับปรุงย้อนหลัง')), `ปรับปรุงย้อนหลังของรอบ ${lockedPeriod}${now ? '' : ' (รายการถูกยกเลิกใน Odoo)'}`],
    });
  }
  return out;
}
