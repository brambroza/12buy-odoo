/**
 * Pushes a confirmed web order to Odoo as a confirmed `sale.order` plus a draft customer invoice.
 * Prices are sent as `price_unit` (the price the dealer saw), see docs/PLAN.md §3.1.
 */
import type { OdooSync, ProtoOrder } from '@/lib/shop/types';
import { PAYMENT_METHOD_LABELS } from '@/lib/shop/types';
import { formatAmount } from '@/lib/money';
import { findCarrierByName } from './delivery-carrier';
import { applyCouponToOrder } from './loyalty';
import { odooRead, odooSearchRead, odooWrite } from './rpc';

type SaleOrderRead = { id: number; name: string; state: string; amount_total: number; invoice_ids?: number[] };
type InvoiceRead = { id: number; name: string | false; state: string };
type PartnerSalesRead = { id: number; user_id: [number, string] | false; commercial_partner_id: [number, string] | false };

/**
 * Salesperson for a dealer's sale order: the partner's own salesperson, else its company's.
 * Sent explicitly because Odoo otherwise falls back to the API user, who would get the commission.
 * `false` (no salesperson) is sent as-is so the order is visibly unassigned instead of wrong.
 */
export async function salespersonFor(partnerId: number): Promise<number | false> {
  const [partner] = await odooSearchRead<PartnerSalesRead>('res.partner', [['id', '=', partnerId]], ['id', 'user_id', 'commercial_partner_id'], { limit: 1 });
  if (!partner) return false;
  if (partner.user_id) return partner.user_id[0];
  const companyId = partner.commercial_partner_id ? partner.commercial_partner_id[0] : null;
  if (!companyId || companyId === partnerId) return false;
  const [company] = await odooSearchRead<PartnerSalesRead>('res.partner', [['id', '=', companyId]], ['id', 'user_id', 'commercial_partner_id'], { limit: 1 });
  return company?.user_id ? company.user_id[0] : false;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Odoo product used for the end-of-bill cash discount line (`ODOO_CASH_DISCOUNT_PRODUCT_ID`); null = not set up. */
export function cashDiscountProductId(): number | null {
  const id = Number(process.env.ODOO_CASH_DISCOUNT_PRODUCT_ID);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** How the cash discount goes to Odoo: as separate end-of-bill lines (product + tax field name), or folded into prices. */
export type CashDiscountLine = { productId: number; taxField: string } | null;

/**
 * The cash discount can go as its own lines only when every discounted line knows its taxes
 * (orders placed before tax ids were stored do not), so the discount lines carry the right VAT.
 */
export function canSendCashDiscountLine(order: Pick<ProtoOrder, 'lines' | 'paymentMethod'>): boolean {
  const discounted = order.paymentMethod === 'CASH' ? order.lines.filter((l) => (l.cashDiscountPerUnit ?? 0) > 0) : [];
  return discounted.length > 0 && discounted.every((l) => Array.isArray(l.taxIds));
}

/**
 * End-of-bill cash discount lines: one negative line per set of taxes, so VAT drops with the discount
 * exactly as on the web bill. The label shows the % when every line of the set has the same one.
 */
function cashDiscountLines(order: Pick<ProtoOrder, 'lines' | 'ref'>, discount: NonNullable<CashDiscountLine>): Record<string, unknown>[] {
  const groups = new Map<string, { taxIds: number[]; amount: number; percents: Set<number | undefined> }>();
  for (const line of order.lines) {
    const off = line.qty * (line.cashDiscountPerUnit ?? 0);
    if (off <= 0) continue;
    const taxIds = [...(line.taxIds ?? [])].sort((a, b) => a - b);
    const key = taxIds.join(',');
    const group = groups.get(key) ?? { taxIds, amount: 0, percents: new Set() };
    group.amount += off;
    group.percents.add(line.cashDiscountPercent);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => {
    const [percent] = g.percents;
    const label = g.percents.size === 1 && percent !== undefined ? `ส่วนลดเงินสด ${percent}%` : 'ส่วนลดเงินสด';
    return {
      product_id: discount.productId,
      name: `${label} (ออเดอร์เว็บ ${order.ref})`,
      product_uom_qty: 1,
      price_unit: -round2(g.amount),
      [discount.taxField]: [[6, 0, g.taxIds]],
    };
  });
}

/**
 * Maps web order lines to `sale.order.line` values.
 * A line bought in packs (e.g. "มัด 10 เส้น" × 2) goes out in that pack unit with the
 * pack price, so the warehouse sees packs; otherwise base units. The cash discount goes as
 * end-of-bill lines when `discount` is given, otherwise it is folded into the unit price;
 * either way the Odoo total equals what the dealer paid.
 */
export function buildOrderLines(order: Pick<ProtoOrder, 'lines' | 'paymentMethod'> & { ref?: string }, discount: CashDiscountLine = null): Record<string, unknown>[] {
  const asLines = Boolean(discount) && canSendCashDiscountLine(order);
  const products = order.lines.map((line) => {
    const net = line.unitPrice - (order.paymentMethod === 'CASH' && !asLines ? line.cashDiscountPerUnit ?? 0 : 0);
    const inPacks = Boolean(line.unitId && line.unitQty && line.qty % line.unitQty === 0);
    const factor = inPacks ? line.qty / line.unitQty! : 1;
    return {
      product_id: line.productId,
      product_uom_qty: inPacks ? line.unitQty : line.qty,
      ...(inPacks ? { product_uom_id: line.unitId } : {}),
      price_unit: round2(net * factor),
    };
  });
  return asLines ? [...products, ...cashDiscountLines({ lines: order.lines, ref: order.ref ?? '' }, discount!)] : products;
}

let taxFieldCache: string | null = null;

/** Name of the taxes field on `sale.order.line`: `tax_ids` on Odoo 19, `tax_id` before. Read once. */
export async function saleLineTaxField(): Promise<string> {
  if (taxFieldCache) return taxFieldCache;
  const fields = await odooRead<Record<string, unknown>>('sale.order.line', 'fields_get', [], { attributes: ['type'] });
  taxFieldCache = 'tax_ids' in fields ? 'tax_ids' : 'tax_id';
  return taxFieldCache;
}

/** Cash discount mode for this order: end-of-bill lines when the Odoo product is set up and the order allows it. */
async function cashDiscountLineFor(order: ProtoOrder): Promise<CashDiscountLine> {
  const productId = cashDiscountProductId();
  if (!productId || !canSendCashDiscountLine(order)) return null;
  return { productId, taxField: await saleLineTaxField() };
}

/** Free-text note on the SO: payment, delivery method, delivery address and the dealer's remark. */
export function buildOrderNote(order: ProtoOrder, discountAsLine = false): string {
  const cashNote = order.cashDiscount <= 0 ? '' : discountAsLine
    ? ` (ส่วนลดเงินสด ${formatAmount(order.cashDiscount)} บาท เป็นบรรทัดท้ายบิล)`
    : ` (รวมส่วนลดเงินสด ${formatAmount(order.cashDiscount)} บาทในราคาแล้ว)`;
  return [
    `ออเดอร์เว็บ ${order.ref}`,
    `ชำระ: ${PAYMENT_METHOD_LABELS[order.paymentMethod]}${cashNote}`,
    order.coupon ? `คูปอง: ${order.coupon.code} (${order.coupon.programName}) เว็บคำนวณส่วนลด ${formatAmount(order.couponDiscount)} บาท` : '',
    order.poRef ? `เลขที่ใบสั่งซื้อของร้าน: ${order.poRef}` : '',
    `การจัดส่ง: ${order.carrier}`,
    `ส่งที่: ${order.address}`,
    order.note ? `หมายเหตุ: ${order.note}` : '',
  ].filter(Boolean).join('\n');
}

/** Totals within 1 satang count as equal. */
export function totalsMatch(odooTotal: number, webTotal: number): boolean {
  return Math.abs(odooTotal - webTotal) < 0.01;
}

/**
 * Odoo delivery method for the SO: the stored id, else (orders from before the id was stored)
 * the active method with the same name. None found: the SO goes without one and the note keeps the name.
 */
export async function carrierIdFor(order: Pick<ProtoOrder, 'carrier' | 'carrierId'>): Promise<number | null> {
  if (order.carrierId) return order.carrierId;
  if (!order.carrier) return null;
  return (await findCarrierByName(order.carrier))?.id ?? null;
}

const SO_FIELDS = ['id', 'name', 'state', 'amount_total', 'invoice_ids'];

async function findByRef(ref: string): Promise<SaleOrderRead | null> {
  const rows = await odooSearchRead<SaleOrderRead>('sale.order', [['client_order_ref', '=', ref]], SO_FIELDS, { limit: 1 });
  return rows[0] ?? null;
}

async function readById(id: number): Promise<SaleOrderRead> {
  const rows = await odooSearchRead<SaleOrderRead>('sale.order', [['id', '=', id]], SO_FIELDS, { limit: 1 });
  if (!rows[0]) throw new Error(`อ่าน sale.order #${id} ไม่ได้`);
  return rows[0];
}

/**
 * Draft customer invoice of a confirmed SO: the existing one, else one made with Odoo's
 * "Create invoice" wizard (regular invoice; every product is invoiced on ordered qty).
 * Safe to retry: an SO that already has an invoice gets no second one. Accounting posts it in Odoo.
 */
export async function ensureDraftInvoice(saleOrderId: number, invoiceIds: number[] = []): Promise<NonNullable<OdooSync['invoice']>> {
  let ids = invoiceIds;
  if (!ids.length) {
    const context = { active_model: 'sale.order', active_ids: [saleOrderId], active_id: saleOrderId };
    const created = await odooWrite<number | number[]>('sale.advance.payment.inv', 'create', [[{ advance_payment_method: 'delivered', sale_order_ids: [[6, 0, [saleOrderId]]] }]], { context });
    await odooWrite<unknown>('sale.advance.payment.inv', 'create_invoices', [[Array.isArray(created) ? created[0] : created]], { context });
    ids = (await readById(saleOrderId)).invoice_ids ?? [];
  }
  const [invoice] = ids.length
    ? await odooSearchRead<InvoiceRead>('account.move', [['id', 'in', ids], ['move_type', '=', 'out_invoice']], ['id', 'name', 'state'], { order: 'id desc', limit: 1 })
    : [];
  if (!invoice) throw new Error('Odoo ไม่ได้สร้างใบแจ้งหนี้ให้ใบสั่งขายนี้');
  // A draft has no number yet ("/" or empty) until accounting posts it.
  return { id: invoice.id, name: invoice.name && invoice.name !== '/' ? invoice.name : null, state: invoice.state };
}

/**
 * Creates and confirms the SO for `order`, or returns the existing one with the same
 * `client_order_ref` (safe to retry). A coupon is applied through Odoo's wizard while the
 * SO is still a draft. Then a draft invoice is made; if that fails the SO still counts as sent and
 * `invoiceError` says why (the admin can retry). The result compares Odoo's total with the web total.
 */
export async function pushOrderToOdoo(order: ProtoOrder, partnerId: number): Promise<OdooSync> {
  let so = await findByRef(order.ref);
  if (!so) {
    const salesperson = await salespersonFor(partnerId);
    const carrierId = await carrierIdFor(order);
    const discount = await cashDiscountLineFor(order);
    const created = await odooWrite<number | number[]>('sale.order', 'create', [[{
      partner_id: partnerId,
      user_id: salesperson,
      client_order_ref: order.ref,
      origin: 'Web',
      ...(order.odooPricelistId ? { pricelist_id: order.odooPricelistId } : {}),
      ...(carrierId ? { carrier_id: carrierId } : {}),
      note: buildOrderNote(order, Boolean(discount)),
      order_line: buildOrderLines(order, discount).map((values) => [0, 0, values]),
    }]]);
    so = await readById(Array.isArray(created) ? created[0] : created);
  }
  if (so.state === 'draft' || so.state === 'sent') {
    if (order.coupon) await applyCouponToOrder(so.id, order.coupon.code);
    await odooWrite<boolean>('sale.order', 'action_confirm', [[so.id]]);
    so = await readById(so.id);
  }
  let invoice: OdooSync['invoice'] = null;
  let invoiceError: string | null = null;
  try {
    invoice = await ensureDraftInvoice(so.id, so.invoice_ids);
  } catch (error) {
    invoiceError = error instanceof Error ? error.message : String(error);
  }
  return {
    status: totalsMatch(so.amount_total, order.total) ? 'SYNCED' : 'MISMATCH',
    saleOrderId: so.id,
    saleOrderName: so.name,
    amountTotal: so.amount_total,
    error: null,
    invoice,
    invoiceError,
    at: new Date().toISOString(),
  };
}
