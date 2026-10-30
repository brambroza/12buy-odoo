// Pure helpers, safe to import from client components.

/** Credit position: `limit` null means no limit; `used` is what is already owed or reserved. */
export type CreditLine = { limit: number | null; used: number };

/** Order statuses that still hold credit: everything except paid and cancelled. */
const RELEASED = new Set(['PAID', 'CANCELLED']);

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Credit left after placing an order of `orderTotal` on credit.
 * `remaining` is null when the partner has no credit limit; `over` is true when the order would exceed it.
 */
export function creditAfterOrder(credit: CreditLine | null, orderTotal: number): { remaining: number | null; over: boolean } {
  if (!credit || credit.limit === null) return { remaining: null, over: false };
  const remaining = round2(credit.limit - credit.used - orderTotal);
  return { remaining, over: remaining < 0 };
}

/**
 * The credit line with the least room left (web limit vs. Odoo `credit_limit`), so one check covers both.
 * Lines without a limit are ignored; null when none of them has one.
 */
export function tightestCredit(...lines: (CreditLine | null)[]): CreditLine | null {
  let best: CreditLine | null = null;
  for (const line of lines) {
    if (!line || line.limit === null) continue;
    if (!best || line.limit - line.used < best.limit! - best.used) best = line;
  }
  return best;
}

/** Order scopes that belong to a dealer: its own logins and staff ordering for its Odoo partner. */
export function isDealerScope(scope: string, dealerId: string, odooPartnerId: number | null): boolean {
  if (scope === `dealer:${dealerId}`) return true;
  return odooPartnerId !== null && scope.startsWith('staff:') && scope.endsWith(`:${odooPartnerId}`);
}

/**
 * Web credit used by a dealer: carried-over debt plus every CREDIT order of the dealer that is not yet paid or cancelled.
 * Placing a credit order takes from the line; the order turning PAID or CANCELLED gives it back.
 */
export function webCreditUsed(
  dealer: { id: string; odooPartnerId: number | null; creditOpening: number },
  orders: { scope: string; paymentMethod: string; status: string; total: number }[],
): number {
  let used = dealer.creditOpening;
  for (const order of orders) {
    if (order.paymentMethod === 'CREDIT' && !RELEASED.has(order.status) && isDealerScope(order.scope, dealer.id, dealer.odooPartnerId)) used += order.total;
  }
  return round2(used);
}

/** Web credit line of a dealer row; null when the dealer has no web limit. NUMERIC columns may come in as strings. */
export function webCreditLine(
  dealer: { id: string; odooPartnerId: number | null; creditLimit: number | string | null; creditOpening: number | string },
  orders: { scope: string; paymentMethod: string; status: string; total: number }[],
): CreditLine | null {
  if (dealer.creditLimit == null) return null;
  const used = webCreditUsed({ id: dealer.id, odooPartnerId: dealer.odooPartnerId, creditOpening: Number(dealer.creditOpening) || 0 }, orders);
  return { limit: Number(dealer.creditLimit), used };
}

/** Who placed an order, from its scope: `dealer:<id>` or `staff:<user>:<partner>`. Null for anything else (e.g. staff demo). */
export function parseOrderScope(scope: string): { dealerId: string } | { odooPartnerId: number } | null {
  if (scope.startsWith('dealer:')) return scope.length > 7 ? { dealerId: scope.slice(7) } : null;
  const staff = /^staff:[^:]+:(\d+)$/.exec(scope);
  const partnerId = staff ? Number(staff[1]) : 0;
  return partnerId > 0 ? { odooPartnerId: partnerId } : null;
}

/** Credit line as seen when confirming one order: room left before it and after it. */
export type OrderCreditView = { limit: number; used: number; before: number; after: number; over: boolean };

/**
 * Before/after view of a credit line for one order. `counted` is true when `line.used` already
 * includes this order (web line: pending credit orders reserve credit), false when it does not
 * (Odoo line: the SO is only created on confirm). Null without a limit.
 */
export function orderCreditView(line: CreditLine | null, orderTotal: number, counted: boolean): OrderCreditView | null {
  if (!line || line.limit === null) return null;
  const used = round2(counted ? line.used - orderTotal : line.used);
  const before = round2(line.limit - used);
  const after = round2(before - orderTotal);
  return { limit: line.limit, used, before, after, over: after < 0 };
}
