/**
 * Sends a confirmed web order to Odoo: make sure the dealer has a partner,
 * create + confirm the SO with its draft invoice, and record the outcome on the order.
 */
import { findDealerByPartnerId, getDealer } from '@/lib/dealers/repo';
import { ensureDealerPartner } from '@/lib/odoo/dealer-partner';
import { pushOrderToOdoo } from '@/lib/odoo/sale-order';
import { profileFromDealer } from './dealer';
import * as store from './store';
import type { OdooSync, ProtoOrder } from './types';

/** Orders whose status means the admin already confirmed them. */
const CONFIRMED = new Set(['PREPARING', 'SHIPPED', 'INVOICED', 'PAID']);

/** Dealer id from an order's session key (`dealer:<id>`); null for staff orders. */
export function dealerIdFromSession(sessionId: string): string | null {
  const match = /^dealer:(.+)$/.exec(sessionId);
  return match ? match[1] : null;
}

/**
 * Odoo partner id from a staff order's session key (`staff:<user>:<partnerId>`), placed while
 * "เปิดมุมมองดีลเลอร์" on an Odoo customer; null for dealer orders and the demo view (`staff:<user>:demo`).
 */
export function partnerIdFromSession(sessionId: string): number | null {
  const match = /^staff:[^:]+:(\d+)$/.exec(sessionId);
  const id = match ? Number(match[1]) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** True when the order belongs to a real customer (a web dealer or an Odoo partner), not the staff demo view. */
export function hasRealCustomer(order: Pick<ProtoOrder, 'sessionId'>): boolean {
  return dealerIdFromSession(order.sessionId) !== null || partnerIdFromSession(order.sessionId) !== null;
}

/** Orders the admin can (re)send: confirmed, for a real customer, and not in Odoo yet or still missing the draft invoice. */
export function canSyncOrder(order: ProtoOrder): boolean {
  const odoo = order.odoo;
  const unsent = !odoo || odoo.status === 'FAILED' || Boolean(odoo.invoiceError);
  return CONFIRMED.has(order.status) && hasRealCustomer(order) && unsent;
}

/**
 * Odoo partner for the order: a web dealer gets its linked partner (created on first push);
 * a staff order for an Odoo customer uses that partner, through its web dealer record when one is linked.
 */
async function partnerIdFor(order: ProtoOrder): Promise<number> {
  const dealerId = dealerIdFromSession(order.sessionId);
  const partnerId = partnerIdFromSession(order.sessionId);
  if (!dealerId && !partnerId) throw new Error('ออเดอร์ทดสอบจากมุมมองแอดมิน (demo) ไม่ส่งเข้า Odoo');
  const dealer = dealerId ? await getDealer(dealerId) : await findDealerByPartnerId(partnerId!);
  if (dealerId && !dealer) throw new Error('ไม่พบดีลเลอร์ของออเดอร์นี้');
  if (dealer) return dealer.odooPartnerId ?? await ensureDealerPartner(dealer, (await profileFromDealer(dealer)).pricelistId);
  return partnerId!;
}

/** Pushes one order and stores the result. Never throws; failures come back as status FAILED. */
export async function syncOrderToOdoo(order: ProtoOrder): Promise<OdooSync> {
  let result: OdooSync;
  try {
    result = await pushOrderToOdoo(order, await partnerIdFor(order));
  } catch (error) {
    result = { status: 'FAILED', saleOrderId: order.odoo?.saleOrderId ?? null, saleOrderName: order.odoo?.saleOrderName ?? null, amountTotal: null, invoice: order.odoo?.invoice ?? null, error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() };
  }
  await store.setOdooSync(order.id, result);
  return result;
}
