/**
 * Sends a confirmed web order to Odoo: make sure the dealer has a partner,
 * create + confirm the SO with its draft invoice, and record the outcome on the order.
 */
import { getDealer } from '@/lib/dealers/repo';
import { ensureDealerPartner } from '@/lib/odoo/dealer-partner';
import { pushOrderToOdoo } from '@/lib/odoo/sale-order';
import { profileFromDealer } from './dealer';
import * as store from './store';
import type { OdooSync, ProtoOrder } from './types';

/** Orders whose status means the admin already confirmed them. */
const CONFIRMED = new Set(['PREPARING', 'SHIPPED', 'INVOICED', 'PAID']);

/** Dealer id from an order's session key (`dealer:<id>`); null for staff test orders. */
export function dealerIdFromSession(sessionId: string): string | null {
  const match = /^dealer:(.+)$/.exec(sessionId);
  return match ? match[1] : null;
}

/** Orders the admin can (re)send: confirmed, from a real dealer, and not in Odoo yet or still missing the draft invoice. */
export function canSyncOrder(order: ProtoOrder): boolean {
  const odoo = order.odoo;
  const unsent = !odoo || odoo.status === 'FAILED' || Boolean(odoo.invoiceError);
  return CONFIRMED.has(order.status) && dealerIdFromSession(order.sessionId) !== null && unsent;
}

/** Pushes one order and stores the result. Never throws; failures come back as status FAILED. */
export async function syncOrderToOdoo(order: ProtoOrder): Promise<OdooSync> {
  let result: OdooSync;
  try {
    const dealerId = dealerIdFromSession(order.sessionId);
    if (!dealerId) throw new Error('ออเดอร์ทดสอบจากมุมมองแอดมิน ไม่ส่งเข้า Odoo');
    const dealer = await getDealer(dealerId);
    if (!dealer) throw new Error('ไม่พบดีลเลอร์ของออเดอร์นี้');
    const partnerId = dealer.odooPartnerId ?? await ensureDealerPartner(dealer, (await profileFromDealer(dealer)).pricelistId);
    result = await pushOrderToOdoo(order, partnerId);
  } catch (error) {
    result = { status: 'FAILED', saleOrderId: order.odoo?.saleOrderId ?? null, saleOrderName: order.odoo?.saleOrderName ?? null, amountTotal: null, invoice: order.odoo?.invoice ?? null, error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() };
  }
  await store.setOdooSync(order.id, result);
  return result;
}
