/**
 * Reads what the commission module needs from one company's Odoo (read-only client per company).
 *
 * "Cash in" means money that reached the bank, not the day a payment was registered:
 * - a customer payment counts once Odoo marks it matched (`is_matched`): posted straight to a bank
 *   account, its date is the cash date; posted to an outstanding-receipts account, the cash date is
 *   when the bank statement line was reconciled with it (a cheque that has not cleared is not matched);
 * - a bank statement line reconciled directly with invoices counts on its own date.
 * Each receipt is followed through `account.partial.reconcile` to the invoices it paid, so the
 * invoice number and days overdue are known even though Odoo's receipt does not print them.
 */
import type { OdooReadClient } from '@/lib/odoo/rpc';
import type { FirstInvoice } from './bonus';
import {
  buildLedger, lastCategorySegment, ownerOf, planFullPayment, repTagName, tagRepKey, withFinalCashDate,
  type DeferredInvoice, type InvoiceSettlement, type LedgerInput, type RawInvoice, type RawInvoiceLine, type RawPartial, type RawReceipt,
} from './ledger';
import { addDays } from './period';
import type { OpenInvoice } from './statement';
import type { CreditNote, LedgerLine, SaleOrder } from './types';

type Ref = [number, string] | null;
type M2O = [number, string] | false;
const ref = (v: M2O | undefined): Ref => (Array.isArray(v) ? [v[0], v[1]] : null);
const date = (v: string | false | null | undefined): string | null => (typeof v === 'string' && v ? v.slice(0, 10) : null);

/** Payments dated up to this many days before a period may still clear (cheques) inside it. */
export const CLEARING_LOOKBACK_DAYS = 120;
const CHUNK = 200;
const PAGE = 500;

/** `search_read` over every page. */
async function searchAll<T>(client: OdooReadClient, model: string, domain: unknown[], fields: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await client.searchRead<T>(model, domain, fields, { limit: PAGE, offset, order: 'id asc' });
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** `read` in chunks so one call never carries thousands of ids. */
async function readAll<T>(client: OdooReadClient, model: string, ids: readonly number[], fields: string[]): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) out.push(...await client.read<T[]>(model, 'read', [unique.slice(i, i + CHUNK)], { fields }));
  return out;
}

/** `search_read` with an `in` filter, chunked. */
async function searchIn<T>(client: OdooReadClient, model: string, field: string, ids: readonly number[], extra: unknown[], fields: string[]): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) out.push(...await searchAll<T>(client, model, [[field, 'in', unique.slice(i, i + CHUNK)], ...extra], fields));
  return out;
}

type PaymentRow = { id: number; name: string; date: string; partner_id: M2O; move_id: M2O; memo?: string | false };
type StatementRow = { id: number; date: string; payment_ref: string | false; partner_id: M2O; move_id: M2O };
type MoveLineRow = { id: number; move_id: M2O; account_type: string | false; matched_debit_ids: number[]; matched_credit_ids: number[] };
type PartialRow = { id: number; debit_move_id: M2O; credit_move_id: M2O; amount: number; max_date: string | false };
type InvoiceRow = {
  id: number; name: string; move_type: string; state: string; invoice_date: string | false; invoice_date_due: string | false; amount_total: number;
  partner_id: M2O; commercial_partner_id: M2O; invoice_user_id: M2O;
};
type InvoiceLineRow = { id: number; move_id: M2O; product_id: M2O; name: string | false; quantity: number; price_subtotal: number; price_total: number; sale_line_ids: number[] };

export type RepDirectory = {
  /** Customer tag id → rep key + name, for tags named "Sale …". */
  tags: Map<number, [number, string]>;
  /** Odoo user id → rep key of the "Sale …" tag with the same name. */
  userReps: Map<number, [number, string]>;
  /** Internal users without a matching tag (salesperson fallback reps). */
  users: { id: number; name: string }[];
};

/** Customer tags "Sale …" (the real reps) and internal users, matched by name (`Sale Tip` ↔ user `Tip`). */
export async function fetchRepDirectory(client: OdooReadClient): Promise<RepDirectory> {
  const [tagRows, userRows] = await Promise.all([
    client.searchRead<{ id: number; name: string }>('res.partner.category', [], ['id', 'name'], { limit: 1000, order: 'name asc' }),
    fetchOdooUsers(client),
  ]);
  const tags = new Map<number, [number, string]>();
  for (const t of tagRows) {
    const name = repTagName(t.name);
    if (name) tags.set(t.id, [tagRepKey(t.id), name]);
  }
  const byName = new Map([...tags.values()].map((rep) => [rep[1].toLowerCase(), rep]));
  const userReps = new Map<number, [number, string]>();
  const users: { id: number; name: string }[] = [];
  for (const u of userRows) {
    const rep = byName.get(u.name.trim().toLowerCase());
    if (rep) userReps.set(u.id, rep);
    else users.push({ id: u.id, name: u.name });
  }
  return { tags, userReps, users };
}

/** Everything after receipts: invoices, their lines, sale orders, customers (with rep tags) and product categories. */
async function readInvoiceContext(client: OdooReadClient, invoiceIds: number[]) {
  const invoiceRows = invoiceIds.length ? await readAll<InvoiceRow>(client, 'account.move', invoiceIds,
    ['id', 'name', 'move_type', 'state', 'invoice_date', 'invoice_date_due', 'amount_total', 'partner_id', 'commercial_partner_id', 'invoice_user_id']) : [];
  const lineRows = invoiceRows.length ? await searchIn<InvoiceLineRow>(client, 'account.move.line', 'move_id', invoiceRows.map((i) => i.id), [['display_type', '=', 'product']],
    ['id', 'move_id', 'product_id', 'name', 'quantity', 'price_subtotal', 'price_total', 'sale_line_ids']) : [];
  const saleLineIds = lineRows.flatMap((l) => l.sale_line_ids);
  const saleLines = saleLineIds.length ? await readAll<{ id: number; order_id: M2O }>(client, 'sale.order.line', saleLineIds, ['order_id']) : [];
  const orderIds = saleLines.map((l) => ref(l.order_id)?.[0]).filter((id): id is number => id !== undefined);
  const orders = orderIds.length ? await readAll<{ id: number; pricelist_id: M2O; user_id: M2O }>(client, 'sale.order', orderIds, ['pricelist_id', 'user_id']) : [];
  // The invoice's own commercial_partner_id is frozen when it is posted: a contact later moved out of
  // its parent company keeps the old company there. Use the contact's current company instead.
  const contactIds = [...new Set(invoiceRows.map((i) => ref(i.partner_id)?.[0]).filter((id): id is number => id !== undefined))];
  const contacts = contactIds.length ? await readAll<{ id: number; commercial_partner_id: M2O }>(client, 'res.partner', contactIds, ['commercial_partner_id']) : [];
  const companyOf = new Map(contacts.map((c) => [c.id, ref(c.commercial_partner_id)?.[0] ?? c.id]));
  const partnerOf = (i: InvoiceRow) => {
    const contact = ref(i.partner_id)?.[0];
    return (contact !== undefined ? companyOf.get(contact) : undefined) ?? ref(i.commercial_partner_id)?.[0] ?? contact;
  };
  const partnerIds = [...new Set(invoiceRows.map(partnerOf).filter((id): id is number => id !== undefined))];
  const partners = partnerIds.length ? await readAll<{ id: number; property_product_pricelist: M2O; user_id: M2O; category_id?: number[] | false }>(client, 'res.partner', partnerIds, ['property_product_pricelist', 'user_id', 'category_id']) : [];
  const reps = invoiceRows.length ? await fetchRepDirectory(client) : { tags: new Map(), userReps: new Map(), users: [] } as RepDirectory;
  const productIds = lineRows.map((l) => ref(l.product_id)?.[0]).filter((id): id is number => id !== undefined);
  const products = productIds.length ? await readAll<{ id: number; categ_id: M2O }>(client, 'product.product', productIds, ['categ_id']) : [];

  const invoices = new Map<number, RawInvoice & { moveType: string }>();
  for (const i of invoiceRows) {
    if (i.state !== 'posted' || (i.move_type !== 'out_invoice' && i.move_type !== 'out_refund')) continue;
    invoices.set(i.id, {
      id: i.id, name: i.name, invoiceDate: date(i.invoice_date), dueDate: date(i.invoice_date_due), amountTotal: Number(i.amount_total) || 0,
      partnerId: partnerOf(i) ?? null, partnerName: ref(i.partner_id)?.[1] ?? '', invoiceUser: ref(i.invoice_user_id), moveType: i.move_type,
    });
  }
  const invoiceLines: RawInvoiceLine[] = lineRows.map((l) => ({
    id: l.id, moveId: ref(l.move_id)?.[0] ?? 0, productId: ref(l.product_id)?.[0] ?? null, productName: ref(l.product_id)?.[1] ?? (l.name || ''),
    quantity: Number(l.quantity) || 0, subtotal: Number(l.price_subtotal) || 0, total: Number(l.price_total) || 0, saleLineIds: l.sale_line_ids,
  }));
  return {
    invoices,
    invoiceLines,
    saleLineOrder: new Map(saleLines.flatMap((l) => (ref(l.order_id) ? [[l.id, ref(l.order_id)![0]] as [number, number]] : []))),
    orders: new Map(orders.map((o) => [o.id, { pricelist: ref(o.pricelist_id), user: ref(o.user_id) }])),
    partners: new Map(partners.map((p) => [p.id, {
      pricelist: ref(p.property_product_pricelist), user: ref(p.user_id),
      tags: (Array.isArray(p.category_id) ? p.category_id : []).flatMap((id) => (reps.tags.has(id) ? [reps.tags.get(id)!] : [])),
    }])),
    userReps: reps.userReps,
    productCategory: new Map(products.map((p) => [p.id, lastCategorySegment(ref(p.categ_id)?.[1] ?? '')])),
  };
}

export type CollectionFetch = { lines: LedgerLine[]; receipts: number; refunds: { count: number; amount: number }; deferred?: DeferredInvoice[] };

/** Cash received between `start` and `end` (inclusive), split to invoice lines for `period`. */
export async function fetchCollections(client: OdooReadClient, period: string, range: { start: string; end: string }): Promise<CollectionFetch> {
  const payments = await searchAll<PaymentRow>(client, 'account.payment', [
    ['payment_type', '=', 'inbound'], ['partner_type', '=', 'customer'], ['state', 'in', ['paid', 'reconciled']], ['is_matched', '=', true],
    ['date', '>=', addDays(range.start, -CLEARING_LOOKBACK_DAYS)], ['date', '<=', range.end],
  ], ['id', 'name', 'date', 'partner_id', 'move_id', 'memo']);
  const statements = await searchAll<StatementRow>(client, 'account.bank.statement.line', [
    ['is_reconciled', '=', true], ['amount', '>', 0], ['date', '>=', range.start], ['date', '<=', range.end],
  ], ['id', 'date', 'payment_ref', 'partner_id', 'move_id']);
  const refunds = await searchAll<{ id: number; amount: number }>(client, 'account.payment', [
    ['payment_type', '=', 'outbound'], ['partner_type', '=', 'customer'], ['state', 'in', ['paid', 'reconciled']], ['date', '>=', range.start], ['date', '<=', range.end],
  ], ['id', 'amount']);

  const receiptByMove = new Map<number, { key: string; name: string; date: string; partnerName: string; kind: 'payment' | 'statement' }>();
  for (const p of payments) {
    const move = ref(p.move_id);
    if (move) receiptByMove.set(move[0], { key: `P${p.id}`, name: p.name || move[1], date: p.date, partnerName: ref(p.partner_id)?.[1] ?? '', kind: 'payment' });
  }
  for (const s of statements) {
    const move = ref(s.move_id);
    if (move && !receiptByMove.has(move[0])) receiptByMove.set(move[0], { key: `S${s.id}`, name: s.payment_ref || move[1], date: s.date, partnerName: ref(s.partner_id)?.[1] ?? '', kind: 'statement' });
  }
  const moveLines = receiptByMove.size ? await searchIn<MoveLineRow>(client, 'account.move.line', 'move_id', [...receiptByMove.keys()], [],
    ['id', 'move_id', 'account_type', 'matched_debit_ids', 'matched_credit_ids']) : [];

  // Payments on an outstanding account: the cash date is when the bank statement matched them.
  const outstandingPartials = new Map<string, number[]>();
  const directToBank = new Set<string>();
  const receivable: { key: string; partialIds: number[] }[] = [];
  for (const line of moveLines) {
    const receipt = receiptByMove.get(ref(line.move_id)?.[0] ?? -1);
    if (!receipt) continue;
    if (line.account_type === 'asset_receivable') receivable.push({ key: receipt.key, partialIds: line.matched_debit_ids });
    else if (receipt.kind === 'payment' && line.account_type === 'asset_cash') directToBank.add(receipt.key);
    else if (receipt.kind === 'payment') {
      const ids = [...line.matched_debit_ids, ...line.matched_credit_ids];
      if (ids.length) outstandingPartials.set(receipt.key, [...(outstandingPartials.get(receipt.key) ?? []), ...ids]);
    }
  }
  const clearing = outstandingPartials.size ? await readAll<PartialRow>(client, 'account.partial.reconcile', [...outstandingPartials.values()].flat(), ['id', 'max_date']) : [];
  const clearedOn = new Map(clearing.map((p) => [p.id, date(p.max_date)]));

  const receipts: RawReceipt[] = [];
  for (const r of receiptByMove.values()) {
    let cashDate: string | null = r.date;
    if (r.kind === 'payment' && !directToBank.has(r.key)) {
      const dates = (outstandingPartials.get(r.key) ?? []).map((id) => clearedOn.get(id)).filter((d): d is string => Boolean(d));
      cashDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b), r.date) : null;
    }
    if (cashDate && cashDate >= range.start && cashDate <= range.end) receipts.push({ key: r.key, name: r.name, cashDate, partnerName: r.partnerName });
  }
  const kept = new Set(receipts.map((r) => r.key));

  const partialOwner = new Map<number, string>();
  for (const r of receivable) if (kept.has(r.key)) for (const id of r.partialIds) partialOwner.set(id, r.key);
  const partialRows = partialOwner.size ? await readAll<PartialRow>(client, 'account.partial.reconcile', [...partialOwner.keys()], ['id', 'debit_move_id', 'amount']) : [];
  const partials: RawPartial[] = partialRows.flatMap((p) => {
    const debit = ref(p.debit_move_id);
    return debit ? [{ id: p.id, receiptKey: partialOwner.get(p.id)!, debitLineId: debit[0], amount: Number(p.amount) || 0 }] : [];
  });
  const debitLines = partials.length ? await readAll<{ id: number; move_id: M2O }>(client, 'account.move.line', partials.map((p) => p.debitLineId), ['move_id']) : [];
  const debitLineMove = new Map(debitLines.flatMap((l) => (ref(l.move_id) ? [[l.id, ref(l.move_id)![0]] as [number, number]] : [])));
  const context = await readInvoiceContext(client, [...new Set(debitLineMove.values())]);
  const invoices = new Map([...context.invoices].filter(([, i]) => i.moveType === 'out_invoice'));

  // Count an invoice only in the period it becomes fully paid (decided with the client 2026-11-10).
  const full = await fullPaymentOf(client, range, invoices, partials, debitLineMove);
  const receiptsAll = [...receipts, ...full.earlier.map((e) => ({ key: `E${e.partialId}`, name: e.name, cashDate: range.start, partnerName: invoices.get(e.invoiceId)?.partnerName ?? '' }))];
  const partialsAll = [
    ...partials.filter((p) => !full.deferred.has(debitLineMove.get(p.debitLineId) ?? -1)),
    ...full.earlier.map((e) => ({ id: e.partialId, receiptKey: `E${e.partialId}`, debitLineId: full.receivableLine.get(e.partialId)!, amount: e.amount })),
  ];
  for (const [lineId, invoiceId] of full.receivableMove) if (!debitLineMove.has(lineId)) debitLineMove.set(lineId, invoiceId);

  const input: LedgerInput = { period, receipts: receiptsAll, partials: partialsAll, debitLineMove, ...context, invoices };
  return {
    lines: withFinalCashDate(buildLedger(input)),
    receipts: receipts.length,
    refunds: { count: refunds.length, amount: refunds.reduce((s, r) => s + (Number(r.amount) || 0), 0) },
    deferred: full.deferredList,
  };
}

/**
 * For the invoices paid in the period: everything ever reconciled with them (cash on bank / cash
 * journals, or credit notes and write-offs), then which to defer (not fully settled by the period
 * end) and which earlier cash to add (invoices completed now). See `planFullPayment`.
 */
async function fullPaymentOf(client: OdooReadClient, range: { start: string; end: string }, invoices: ReadonlyMap<number, RawInvoice>, partials: readonly RawPartial[], debitLineMove: ReadonlyMap<number, number>) {
  const receivables = invoices.size ? await searchIn<{ id: number; move_id: M2O; matched_credit_ids: number[] }>(client, 'account.move.line', 'move_id', [...invoices.keys()],
    [['account_type', '=', 'asset_receivable']], ['id', 'move_id', 'matched_credit_ids']) : [];
  const receivableMove = new Map(receivables.flatMap((l) => (ref(l.move_id) ? [[l.id, ref(l.move_id)![0]] as [number, number]] : [])));
  const partialLine = new Map(receivables.flatMap((l) => l.matched_credit_ids.map((id) => [id, l.id] as [number, number])));
  const rows = partialLine.size ? await readAll<{ id: number; amount: number; max_date: string | false; credit_move_id: M2O }>(client, 'account.partial.reconcile', [...partialLine.keys()], ['id', 'amount', 'max_date', 'credit_move_id']) : [];
  const creditLines = rows.length ? await readAll<{ id: number; move_id: M2O; journal_id: M2O }>(client, 'account.move.line', rows.flatMap((r) => (ref(r.credit_move_id) ? [ref(r.credit_move_id)![0]] : [])), ['move_id', 'journal_id']) : [];
  const journals = creditLines.length ? await readAll<{ id: number; type: string }>(client, 'account.journal', creditLines.flatMap((l) => (ref(l.journal_id) ? [ref(l.journal_id)![0]] : [])), ['type']) : [];
  const journalType = new Map(journals.map((j) => [j.id, j.type]));
  const creditOf = new Map(creditLines.map((l) => [l.id, { move: ref(l.move_id), cash: ['bank', 'cash'].includes(journalType.get(ref(l.journal_id)?.[0] ?? -1) ?? '') }]));
  const settlements: InvoiceSettlement[] = rows.map((r) => {
    const credit = creditOf.get(ref(r.credit_move_id)?.[0] ?? -1);
    return { partialId: r.id, invoiceId: receivableMove.get(partialLine.get(r.id)!) ?? -1, amount: Number(r.amount) || 0, date: date(r.max_date), cash: credit?.cash ?? false, name: credit?.move?.[1] ?? ref(r.credit_move_id)?.[1] ?? '' };
  });
  const current = new Set(partials.map((p) => p.id));
  // This period's cash always counts towards its invoice, even if the receivable read missed it.
  for (const p of partials) {
    const invoiceId = debitLineMove.get(p.debitLineId);
    if (invoiceId !== undefined && !settlements.some((x) => x.partialId === p.id)) settlements.push({ partialId: p.id, invoiceId, amount: p.amount, date: null, cash: true, name: '' });
  }
  const plan = planFullPayment({ range, invoices, settlements, currentPartialIds: current });
  const deferredList: DeferredInvoice[] = [...plan.deferred].map((id) => {
    const invoice = invoices.get(id)!;
    const mine = settlements.filter((s) => s.invoiceId === id && (current.has(s.partialId) || (s.date !== null && s.date <= range.end)));
    return {
      invoiceId: id, invoiceName: invoice.name, partnerName: invoice.partnerName, amountTotal: invoice.amountTotal,
      settled: Math.round(mine.reduce((sum, s) => sum + s.amount, 0) * 100) / 100,
      cashThisPeriod: Math.round(partials.filter((p) => debitLineMove.get(p.debitLineId) === id).reduce((sum, p) => sum + p.amount, 0) * 100) / 100,
    };
  });
  return { deferred: plan.deferred, earlier: plan.earlier, deferredList, receivableMove, receivableLine: partialLine };
}

/**
 * Credit notes dated in the period and money paid back to customers, so the screen can show them
 * next to the commission. They are never deducted: commission is paid on cash in, and a credit note
 * set against an invoice is not cash, so that invoice simply collects less.
 */
export async function fetchCredits(client: OdooReadClient, range: { start: string; end: string }): Promise<{ credits: CreditNote[]; refunds: { count: number; amount: number } }> {
  const notes = await searchAll<{ id: number; amount_untaxed: number; amount_total: number; reversed_entry_id: M2O }>(client, 'account.move', [
    ['move_type', '=', 'out_refund'], ['state', '=', 'posted'], ['invoice_date', '>=', range.start], ['invoice_date', '<=', range.end],
  ], ['id', 'amount_untaxed', 'amount_total', 'reversed_entry_id']);
  const refunds = await searchAll<{ id: number; amount: number }>(client, 'account.payment', [
    ['payment_type', '=', 'outbound'], ['partner_type', '=', 'customer'], ['state', 'in', ['paid', 'reconciled']], ['date', '>=', range.start], ['date', '<=', range.end],
  ], ['id', 'amount']);
  const context = await readInvoiceContext(client, notes.map((n) => n.id));
  const linesByMove = new Map<number, RawInvoiceLine[]>();
  for (const line of context.invoiceLines) linesByMove.set(line.moveId, [...(linesByMove.get(line.moveId) ?? []), line]);
  const credits = notes.flatMap((n): CreditNote[] => {
    const note = context.invoices.get(n.id);
    if (!note) return [];
    const owner = ownerOf(note, linesByMove.get(n.id) ?? [], context);
    return [{
      id: n.id, name: note.name, date: note.invoiceDate ?? range.start, partnerName: note.partnerName, originName: ref(n.reversed_entry_id)?.[1] ?? null,
      odooUserId: owner.user?.[0] ?? null, repName: owner.user?.[1] ?? null, base: Math.abs(Number(n.amount_untaxed) || 0), gross: Math.abs(Number(n.amount_total) || 0),
    }];
  });
  return { credits, refunds: { count: refunds.length, amount: refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) } };
}

/**
 * Invoiced sales (by invoice date) split to lines with rep, pricelist and family, for the
 * "sales by pricelist group" report. Credit notes come back negative. Reuses the ledger split
 * with each invoice treated as paid in full on its own date.
 */
export async function fetchSales(client: OdooReadClient, period: string, range: { start: string; end: string }): Promise<LedgerLine[]> {
  const ids = await searchAll<{ id: number }>(client, 'account.move', [
    ['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted'], ['invoice_date', '>=', range.start], ['invoice_date', '<=', range.end],
  ], ['id']);
  const context = await readInvoiceContext(client, ids.map((i) => i.id));
  const all = [...context.invoices.values()];
  const build = (moveType: string) => {
    const chosen = all.filter((i) => i.moveType === moveType && i.amountTotal > 0);
    return buildLedger({
      period, ...context,
      receipts: chosen.map((i) => ({ key: `I${i.id}`, name: i.name, cashDate: i.invoiceDate ?? range.start, partnerName: i.partnerName })),
      partials: chosen.map((i) => ({ id: i.id, receiptKey: `I${i.id}`, debitLineId: i.id, amount: i.amountTotal })),
      debitLineMove: new Map(chosen.map((i) => [i.id, i.id])),
      invoices: new Map(chosen.map((i) => [i.id, i])),
    });
  };
  const negate = (l: LedgerLine): LedgerLine => ({ ...l, base: -l.base, gross: -l.gross, qty: -l.qty });
  return [...build('out_invoice'), ...build('out_refund').map(negate)];
}

/**
 * Customer invoices still (partly) unpaid on `asOf` that were due more than `days` days before it,
 * with the unpaid amount before VAT and the rep (same fallback as cash-in lines).
 */
export async function fetchOverdueInvoices(client: OdooReadClient, asOf: string, days: number): Promise<OpenInvoice[]> {
  const rows = await searchAll<{ id: number; amount_residual: number; amount_untaxed: number; amount_total: number }>(client, 'account.move', [
    ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', 'in', ['not_paid', 'partial']], ['invoice_date_due', '<', addDays(asOf, -days)],
  ], ['id', 'amount_residual', 'amount_untaxed', 'amount_total']);
  if (!rows.length) return [];
  const context = await readInvoiceContext(client, rows.map((r) => r.id));
  const linesByMove = new Map<number, RawInvoiceLine[]>();
  for (const line of context.invoiceLines) linesByMove.set(line.moveId, [...(linesByMove.get(line.moveId) ?? []), line]);
  return rows.flatMap((row) => {
    const invoice = context.invoices.get(row.id);
    if (!invoice?.dueDate) return [];
    const owner = ownerOf(invoice, linesByMove.get(row.id) ?? [], context);
    const total = Number(row.amount_total) || 0;
    const residualBase = total > 0 ? Math.round(((Number(row.amount_residual) || 0) * (Number(row.amount_untaxed) || 0) / total) * 100) / 100 : 0;
    return [{ invoiceId: row.id, invoiceName: invoice.name, partnerName: invoice.partnerName, dueDate: invoice.dueDate, odooUserId: owner.user?.[0] ?? null, repName: owner.user?.[1] ?? null, residualBase }];
  });
}

/**
 * For the customers of `invoiceIds`: each customer's (commercial partner's) first-ever posted invoice
 * and the day the customer was created in Odoo, to find new customers.
 */
export async function fetchFirstInvoices(client: OdooReadClient, invoiceIds: readonly number[]): Promise<FirstInvoice[]> {
  if (!invoiceIds.length) return [];
  const own = await readAll<{ id: number; commercial_partner_id: M2O }>(client, 'account.move', invoiceIds, ['commercial_partner_id']);
  const partnerIds = [...new Set(own.map((i) => ref(i.commercial_partner_id)?.[0]).filter((id): id is number => id !== undefined))];
  if (!partnerIds.length) return [];
  const invoices = await searchIn<{ id: number; name: string; invoice_date: string | false; commercial_partner_id: M2O }>(client, 'account.move', 'commercial_partner_id', partnerIds,
    [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']], ['id', 'name', 'invoice_date', 'commercial_partner_id']);
  const first = new Map<number, { id: number; name: string; date: string }>();
  for (const i of invoices) {
    const partner = ref(i.commercial_partner_id)?.[0];
    if (partner === undefined) continue;
    const d = date(i.invoice_date) ?? '9999-12-31';
    const seen = first.get(partner);
    if (!seen || d < seen.date || (d === seen.date && i.id < seen.id)) first.set(partner, { id: i.id, name: i.name, date: d });
  }
  const partners = await readAll<{ id: number; name: string; create_date: string | false }>(client, 'res.partner', partnerIds, ['name', 'create_date']);
  return partners.flatMap((p) => {
    const inv = first.get(p.id);
    return inv ? [{ partnerId: p.id, partnerName: p.name, partnerCreated: date(p.create_date), invoiceId: inv.id, invoiceName: inv.name }] : [];
  });
}

/** Of `ids`, the invoices Odoo now shows as fully paid. */
export async function fetchPaidInvoiceIds(client: OdooReadClient, ids: readonly number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await readAll<{ id: number; payment_state: string }>(client, 'account.move', ids, ['payment_state']);
  return new Set(rows.filter((r) => r.payment_state === 'paid' || r.payment_state === 'in_payment').map((r) => r.id));
}

/** Internal Odoo users (salespeople) of the company. */
export async function fetchOdooUsers(client: OdooReadClient): Promise<{ id: number; name: string; login: string }[]> {
  return client.searchRead<{ id: number; name: string; login: string }>('res.users', [['share', '=', false]], ['id', 'name', 'login'], { order: 'name asc', limit: 500 });
}

/** Pricelists of the company. */
export async function fetchPricelists(client: OdooReadClient): Promise<{ id: number; name: string }[]> {
  return client.searchRead<{ id: number; name: string }>('product.pricelist', [], ['id', 'name'], { order: 'name asc', limit: 500 });
}

/** Products matching a search text (code or name), for per-product rates. */
export async function searchProducts(client: OdooReadClient, text: string): Promise<{ id: number; name: string; category: string }[]> {
  const rows = await client.searchRead<{ id: number; display_name: string; categ_id: M2O }>('product.product',
    ['|', ['default_code', 'ilike', text], ['name', 'ilike', text]], ['id', 'display_name', 'categ_id'], { limit: 30, order: 'default_code asc' });
  return rows.map((r) => ({ id: r.id, name: r.display_name, category: lastCategorySegment(ref(r.categ_id)?.[1] ?? '') }));
}

/** Distinct product categories (brand + family) to pick from when adding a rate. */
export async function fetchCategories(client: OdooReadClient): Promise<string[]> {
  const rows = await client.searchRead<{ id: number; name: string }>('product.category', [], ['id', 'name'], { limit: 1000 });
  return [...new Set(rows.map((r) => lastCategorySegment(r.name)).filter(Boolean))].sort();
}

/** Bangkok day `day` 00:00 (or 23:59:59 with `end`) as Odoo's UTC datetime text ("YYYY-MM-DD HH:MM:SS"). */
export function bangkokToUtc(day: string, end = false): string {
  const local = new Date(`${day}T${end ? '23:59:59' : '00:00:00'}+07:00`);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

/** Odoo UTC datetime text → Bangkok calendar day. */
export function utcToBangkokDay(value: string): string {
  const time = new Date(`${value.replace(' ', 'T')}Z`).getTime();
  return Number.isFinite(time) ? new Date(time + 7 * 3_600_000).toISOString().slice(0, 10) : value.slice(0, 10);
}

type SaleOrderRow = { id: number; name: string; state: string; date_order: string | false; amount_untaxed: number; amount_total: number; partner_id: M2O; user_id: M2O };

/**
 * Confirmed sale orders (state sale / done, not cancelled) dated in the period (Bangkok days), each
 * with its rep by the commission rule: the customer's (commercial partner's) first "Sale …" tag, else
 * the order's salesperson mapped to the tag rep of the same name. All products count.
 */
export async function fetchSaleOrders(client: OdooReadClient, period: string, range: { start: string; end: string }): Promise<SaleOrder[]> {
  const rows = await searchAll<SaleOrderRow>(client, 'sale.order', [
    ['state', 'in', ['sale', 'done']], ['date_order', '>=', bangkokToUtc(range.start)], ['date_order', '<=', bangkokToUtc(range.end, true)],
  ], ['id', 'name', 'state', 'date_order', 'amount_untaxed', 'amount_total', 'partner_id', 'user_id']);
  if (!rows.length) return [];
  const contacts = await readAll<{ id: number; commercial_partner_id: M2O }>(client, 'res.partner', rows.map((r) => ref(r.partner_id)?.[0]).filter((id): id is number => id !== undefined), ['commercial_partner_id']);
  const commercialOf = new Map(contacts.map((c) => [c.id, ref(c.commercial_partner_id)?.[0] ?? c.id]));
  const companies = await readAll<{ id: number; category_id?: number[] | false }>(client, 'res.partner', [...new Set(commercialOf.values())], ['category_id']);
  const reps = await fetchRepDirectory(client);
  const tagsOf = new Map(companies.map((p) => [p.id, (Array.isArray(p.category_id) ? p.category_id : []).flatMap((id) => (reps.tags.has(id) ? [reps.tags.get(id)!] : []))]));
  return rows.map((r) => {
    const partner = ref(r.partner_id);
    const tags = partner ? tagsOf.get(commercialOf.get(partner[0]) ?? partner[0]) ?? [] : [];
    const user = ref(r.user_id);
    const owner = tags[0] ?? (user ? reps.userReps.get(user[0]) ?? user : null);
    return {
      orderId: r.id, orderName: r.name, orderDate: r.date_order ? utcToBangkokDay(r.date_order) : range.start, partnerName: partner?.[1] ?? '',
      odooUserId: owner?.[0] ?? null, repName: owner?.[1] ?? null, amountUntaxed: Number(r.amount_untaxed) || 0, amountTotal: Number(r.amount_total) || 0, period,
    };
  });
}

/**
 * Posted customer invoices dated in the period (by invoice date) as incentive documents, one per
 * invoice with its amount before VAT, credit notes of the period negative; rep as for cash-in lines
 * (customer "Sale …" tag, else the salesperson). The same figures as the "ยอดขายตามกลุ่มราคา" page.
 */
export async function fetchInvoiceSales(client: OdooReadClient, period: string, range: { start: string; end: string }): Promise<SaleOrder[]> {
  const docs = new Map<number, SaleOrder>();
  for (const l of await fetchSales(client, period, range)) {
    if (l.invoiceId === null) continue;
    const doc = docs.get(l.invoiceId) ?? {
      orderId: l.invoiceId, orderName: l.invoiceName ?? l.receiptName, orderDate: l.invoiceDate ?? range.start, partnerName: l.partnerName,
      odooUserId: l.odooUserId, repName: l.repName, amountUntaxed: 0, amountTotal: 0, period,
    };
    doc.amountUntaxed += l.base;
    doc.amountTotal += l.gross;
    docs.set(l.invoiceId, doc);
  }
  return [...docs.values()].map((d) => ({ ...d, amountUntaxed: Math.round(d.amountUntaxed * 100) / 100, amountTotal: Math.round(d.amountTotal * 100) / 100 }));
}
