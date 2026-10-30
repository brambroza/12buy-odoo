import { findDealerByPartnerId, getDealer } from '@/lib/dealers/repo';
import { getPartnerCredit } from './catalog';
import { orderCreditView, parseOrderScope, tightestCredit, webCreditLine, type CreditLine, type OrderCreditView } from './credit';
import { listOpenCreditOrders } from './store';
import type { DealerProfile } from './types';

/**
 * Web credit line of a dealer (limit set in the back office, used = carried-over debt + open credit orders).
 * Live, not cached: every order and payment moves it. Null when the dealer has no web limit.
 */
export async function getWebCredit(dealerId: string): Promise<CreditLine | null> {
  const dealer = await getDealer(dealerId);
  if (!dealer || dealer.creditLimit == null) return null;
  return webCreditLine(dealer, await listOpenCreditOrders(dealer));
}

/**
 * Credit line a credit order is checked against: whichever of the web limit and Odoo's `credit_limit`
 * has less room left. Odoo unreachable: only the web limit applies (sales still confirms the order).
 */
export async function getCreditLine(profile: Pick<DealerProfile, 'credit' | 'dealerId' | 'odooPartnerId'>): Promise<CreditLine | null> {
  if (!profile.credit) return null;
  const [web, odoo] = await Promise.all([
    profile.dealerId ? getWebCredit(profile.dealerId) : null,
    profile.odooPartnerId ? getPartnerCredit(profile.odooPartnerId).catch(() => null) : null,
  ]);
  return tightestCredit(web, odoo);
}

/** Credit of the dealer behind one order, for the admin confirming it. `odooError` when Odoo could not be read. */
export type OrderCredit = { web: OrderCreditView | null; odoo: OrderCreditView | null; odooError: boolean };

/**
 * Web and Odoo credit lines of whoever placed a pending credit order, each as room before/after it.
 * The pending order already reserves web credit but is not in Odoo yet. Null when the scope maps to no customer.
 */
export async function getPendingOrderCredit(order: { sessionId: string; total: number }): Promise<OrderCredit | null> {
  const who = parseOrderScope(order.sessionId);
  if (!who) return null;
  const dealer = 'dealerId' in who ? await getDealer(who.dealerId) : await findDealerByPartnerId(who.odooPartnerId);
  const partnerId = dealer?.odooPartnerId ?? ('odooPartnerId' in who ? who.odooPartnerId : null);
  if (!dealer && !partnerId) return null;
  let odooError = false;
  const [web, odoo] = await Promise.all([
    dealer && dealer.creditLimit != null ? listOpenCreditOrders(dealer).then((orders) => webCreditLine(dealer, orders)) : null,
    partnerId ? getPartnerCredit(partnerId).catch(() => { odooError = true; return null; }) : null,
  ]);
  return { web: orderCreditView(web, order.total, true), odoo: orderCreditView(odoo, order.total, false), odooError };
}
