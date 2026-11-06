import { findDealerByPartnerId, getDealer } from '@/lib/dealers/repo';
import { thaiDay } from '@/lib/admin/dashboard';
import { readOpenInvoices, type OdooOpenInvoice } from '@/lib/odoo/partner-receivables';
import { getPartnerCredit } from './catalog';
import { orderCreditView, overdueFromInvoices, overdueFromWebOrders, parseOrderScope, tightestCredit, webCreditLine, type CreditLine, type OrderCreditView, type OverdueSummary } from './credit';
import { listOpenCreditOrders } from './store';
import type { DealerProfile } from './types';

/**
 * Credit position of a dealer: the line orders are checked against, Odoo's Total Receivable and open invoices
 * (null when Odoo could not be read) and what is overdue.
 */
export type CreditSummary = { line: CreditLine | null; odooReceivable: number | null; openInvoices: OdooOpenInvoice[] | null; overdue: OverdueSummary | null };

/**
 * Overdue of a customer: from Odoo's open invoices when they could be read, else from the dealer's own web
 * credit orders (last status sync). Null when neither source exists (no Odoo link and no dealer row).
 */
async function overdueOf(dealer: { id: string; odooPartnerId: number | null } | null, openInvoices: OdooOpenInvoice[] | null, orders?: Awaited<ReturnType<typeof listOpenCreditOrders>> | null): Promise<OverdueSummary | null> {
  const today = thaiDay(Date.now());
  if (openInvoices) return overdueFromInvoices(openInvoices, today);
  if (!dealer) return null;
  return overdueFromWebOrders(dealer, orders ?? await listOpenCreditOrders(dealer), today);
}

/** Odoo credit and open invoices of a partner; either is null when Odoo could not be read. */
async function readOdooCredit(partnerId: number | null) {
  if (!partnerId) return { odoo: null, openInvoices: null };
  const odoo = await getPartnerCredit(partnerId).catch(() => null);
  const openInvoices = odoo ? await readOpenInvoices(odoo.commercialId ?? partnerId).catch(() => null) : null;
  return { odoo, openInvoices };
}

/**
 * Credit line a credit order is checked against: whichever of the web limit and Odoo's `credit_limit`
 * has less room left, plus the overdue that locks credit ordering. Odoo unreachable: only the web limit
 * applies, with the manual carried-over debt, and overdue is counted from the dealer's web orders.
 */
export async function getCreditSummary(profile: Pick<DealerProfile, 'credit' | 'dealerId' | 'odooPartnerId'>): Promise<CreditSummary> {
  if (!profile.credit) return { line: null, odooReceivable: null, openInvoices: null, overdue: null };
  const { odoo, openInvoices } = await readOdooCredit(profile.odooPartnerId);
  const odooReceivable = odoo ? odoo.used : null;
  const dealer = profile.dealerId ? await getDealer(profile.dealerId) : null;
  const orders = dealer ? await listOpenCreditOrders(dealer) : null;
  const web = dealer && orders && dealer.creditLimit != null ? webCreditLine(dealer, orders, dealer.odooPartnerId ? odooReceivable : null) : null;
  const overdue = await overdueOf(dealer, openInvoices, orders);
  return { line: tightestCredit(web, odoo), odooReceivable, openInvoices, overdue };
}

/** {@link getCreditSummary} without the receivable and invoices. */
export async function getCreditLine(profile: Pick<DealerProfile, 'credit' | 'dealerId' | 'odooPartnerId'>): Promise<CreditLine | null> {
  return (await getCreditSummary(profile)).line;
}

/** Credit of the dealer behind one order, for the admin confirming it. `odooError` when Odoo could not be read. */
export type OrderCredit = { web: OrderCreditView | null; odoo: OrderCreditView | null; odooError: boolean; overdue: OverdueSummary | null };

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
  const [orders, { odoo, openInvoices }] = await Promise.all([
    dealer ? listOpenCreditOrders(dealer) : null,
    readOdooCredit(partnerId),
  ]);
  const odooError = Boolean(partnerId) && !odoo;
  const web = dealer && orders && dealer.creditLimit != null ? webCreditLine(dealer, orders, dealer.odooPartnerId && odoo ? odoo.used : null) : null;
  const overdue = await overdueOf(dealer, openInvoices, orders);
  return { web: orderCreditView(web, order.total, true), odoo: orderCreditView(odoo, order.total, false), odooError, overdue };
}
