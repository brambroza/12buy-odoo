// Pure helpers, safe to import from client components.

/**
 * Credit left after placing an order of `orderTotal` on credit.
 * `remaining` is null when the partner has no credit limit; `over` is true when the order would exceed it.
 */
export function creditAfterOrder(credit: { limit: number | null; used: number } | null, orderTotal: number): { remaining: number | null; over: boolean } {
  if (!credit || credit.limit === null) return { remaining: null, over: false };
  const remaining = Math.round((credit.limit - credit.used - orderTotal) * 100) / 100;
  return { remaining, over: remaining < 0 };
}

