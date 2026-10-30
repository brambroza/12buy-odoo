/**
 * Pushes a confirmed web order to Odoo as a confirmed `sale.order`.
 * Prices are sent as `price_unit` (the price the dealer saw), see docs/PLAN.md §3.1.
 */
import type { OdooSync, ProtoOrder } from '@/lib/shop/types';
import { PAYMENT_METHOD_LABELS } from '@/lib/shop/types';
import { formatAmount } from '@/lib/money';
import { findCarrierByName } from './delivery-carrier';
import { applyCouponToOrder } from './loyalty';
import { odooSearchRead, odooWrite } from './rpc';

type SaleOrderRead = { id: number; name: string; state: string; amount_total: number };
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

/**
 * Maps web order lines to `sale.order.line` values.
 * A line bought in packs (e.g. "มัด 10 เส้น" × 2) goes out in that pack unit with the
 * pack price, so the warehouse sees packs; otherwise base units. The cash discount
 * is folded into the unit price so the Odoo total equals what the dealer paid.
 */
export function buildOrderLines(order: Pick<ProtoOrder, 'lines' | 'paymentMethod'>): Record<string, unknown>[] {
  return order.lines.map((line) => {
    const net = line.unitPrice - (order.paymentMethod === 'CASH' ? line.cashDiscountPerUnit ?? 0 : 0);
    const inPacks = Boolean(line.unitId && line.unitQty && line.qty % line.unitQty === 0);
    const factor = inPacks ? line.qty / line.unitQty! : 1;
    return {
      product_id: line.productId,
      product_uom_qty: inPacks ? line.unitQty : line.qty,
      ...(inPacks ? { product_uom_id: line.unitId } : {}),
      price_unit: round2(net * factor),
    };
  });
}

/** Free-text note on the SO: payment, delivery method, delivery address and the dealer's remark. */
export function buildOrderNote(order: ProtoOrder): string {
  return [
    `ออเดอร์เว็บ ${order.ref}`,
    `ชำระ: ${PAYMENT_METHOD_LABELS[order.paymentMethod]}${order.cashDiscount > 0 ? ` (รวมส่วนลดเงินสด ${formatAmount(order.cashDiscount)} บาทในราคาแล้ว)` : ''}`,
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

async function findByRef(ref: string): Promise<SaleOrderRead | null> {
  const rows = await odooSearchRead<SaleOrderRead>('sale.order', [['client_order_ref', '=', ref]], ['id', 'name', 'state', 'amount_total'], { limit: 1 });
  return rows[0] ?? null;
}

async function readById(id: number): Promise<SaleOrderRead> {
  const rows = await odooSearchRead<SaleOrderRead>('sale.order', [['id', '=', id]], ['id', 'name', 'state', 'amount_total'], { limit: 1 });
  if (!rows[0]) throw new Error(`อ่าน sale.order #${id} ไม่ได้`);
  return rows[0];
}

/**
 * Creates and confirms the SO for `order`, or returns the existing one with the same
 * `client_order_ref` (safe to retry). A coupon is applied through Odoo's wizard while the
 * SO is still a draft. The result compares Odoo's total with the web total.
 */
export async function pushOrderToOdoo(order: ProtoOrder, partnerId: number): Promise<OdooSync> {
  let so = await findByRef(order.ref);
  if (!so) {
    const salesperson = await salespersonFor(partnerId);
    const carrierId = await carrierIdFor(order);
    const created = await odooWrite<number | number[]>('sale.order', 'create', [[{
      partner_id: partnerId,
      user_id: salesperson,
      client_order_ref: order.ref,
      origin: 'Web',
      ...(order.odooPricelistId ? { pricelist_id: order.odooPricelistId } : {}),
      ...(carrierId ? { carrier_id: carrierId } : {}),
      note: buildOrderNote(order),
      order_line: buildOrderLines(order).map((values) => [0, 0, values]),
    }]]);
    so = await readById(Array.isArray(created) ? created[0] : created);
  }
  if (so.state === 'draft' || so.state === 'sent') {
    if (order.coupon) await applyCouponToOrder(so.id, order.coupon.code);
    await odooWrite<boolean>('sale.order', 'action_confirm', [[so.id]]);
    so = await readById(so.id);
  }
  return {
    status: totalsMatch(so.amount_total, order.total) ? 'SYNCED' : 'MISMATCH',
    saleOrderId: so.id,
    saleOrderName: so.name,
    amountTotal: so.amount_total,
    error: null,
    at: new Date().toISOString(),
  };
}
