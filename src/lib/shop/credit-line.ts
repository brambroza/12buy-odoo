import { getDealer } from '@/lib/dealers/repo';
import { getPartnerCredit } from './catalog';
import { tightestCredit, webCreditLine, type CreditLine } from './credit';
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
