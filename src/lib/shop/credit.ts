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

/** Credit orders already in Odoo's Total Receivable: a posted invoice exists (status follows Odoo). */
const IN_RECEIVABLE = new Set(['INVOICED']);

/**
 * Web credit used by a dealer: carried-over debt plus every CREDIT order of the dealer that is not yet paid or cancelled.
 * Placing a credit order takes from the line; the order turning PAID or CANCELLED gives it back.
 * `odooReceivable` (the linked partner's Total Receivable) replaces the manual `creditOpening`; invoiced orders
 * are then skipped because their posted invoices are already in it. Null/undefined = Odoo not linked or unreachable.
 */
export function webCreditUsed(
  dealer: { id: string; odooPartnerId: number | null; creditOpening: number },
  orders: { scope: string; paymentMethod: string; status: string; total: number }[],
  odooReceivable?: number | null,
): number {
  const fromOdoo = odooReceivable != null;
  let used = fromOdoo ? odooReceivable : dealer.creditOpening;
  for (const order of orders) {
    if (order.paymentMethod !== 'CREDIT' || RELEASED.has(order.status) || (fromOdoo && IN_RECEIVABLE.has(order.status))) continue;
    if (isDealerScope(order.scope, dealer.id, dealer.odooPartnerId)) used += order.total;
  }
  return round2(used);
}

/** Web credit line of a dealer row; null when the dealer has no web limit. NUMERIC columns may come in as strings. */
export function webCreditLine(
  dealer: { id: string; odooPartnerId: number | null; creditLimit: number | string | null; creditOpening: number | string },
  orders: { scope: string; paymentMethod: string; status: string; total: number }[],
  odooReceivable?: number | null,
): CreditLine | null {
  if (dealer.creditLimit == null) return null;
  const used = webCreditUsed({ id: dealer.id, odooPartnerId: dealer.odooPartnerId, creditOpening: Number(dealer.creditOpening) || 0 }, orders, odooReceivable);
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

/**
 * Unpaid credit past its due date. `source` says where it was counted: Odoo's open invoices of the customer,
 * or (Odoo unreachable) the invoices of the dealer's web orders from the last status sync.
 */
export type OverdueSummary = {
  /** Invoices past due by more than the grace days: these lock credit ordering. */
  amount: number;
  count: number;
  oldestDueDate: string | null;
  source: 'odoo' | 'web';
  /** Grace days the summary was built with (0 = lock the day after the due date). */
  graceDays: number;
  /** Invoices past due but still inside the grace days; `lockDate` is the first day credit will be locked. Null when none. */
  grace: { amount: number; count: number; lockDate: string } | null;
};

/** Invoice payment states that no longer owe anything. */
const SETTLED = new Set(['paid', 'in_payment', 'reversed']);

/** Below this (rounding left on a partly paid invoice) an invoice does not count as overdue. */
const OVERDUE_TOLERANCE = 1;

/** `YYYY-MM-DD` plus `days` (negative allowed), computed in UTC so no DST shift. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Splits past-due invoices into locked (due date + grace days before `today`) and in grace (past due, not
 * yet locked). `today` and due dates are `YYYY-MM-DD`.
 */
function summarize(rows: readonly { residual: number; dueDate: string }[], today: string, graceDays: number, source: OverdueSummary['source']): OverdueSummary {
  const locked = rows.filter((r) => addDays(r.dueDate, graceDays) < today);
  const inGrace = rows.filter((r) => r.dueDate < today && addDays(r.dueDate, graceDays) >= today);
  const oldest = locked.reduce<string | null>((min, r) => (min === null || r.dueDate < min ? r.dueDate : min), null);
  const graceOldest = inGrace.reduce<string | null>((min, r) => (min === null || r.dueDate < min ? r.dueDate : min), null);
  return {
    amount: round2(locked.reduce((sum, r) => sum + r.residual, 0)),
    count: locked.length,
    oldestDueDate: oldest,
    source,
    graceDays,
    grace: graceOldest ? { amount: round2(inGrace.reduce((sum, r) => sum + r.residual, 0)), count: inGrace.length, lockDate: addDays(graceOldest, graceDays + 1) } : null,
  };
}

/**
 * Overdue from Odoo's open invoices: each invoice still owing more than the tolerance whose due date is before
 * `today` (`YYYY-MM-DD`, Thai day); it locks credit once `graceDays` more days have passed. Credit notes are
 * not netted: accounting applies them to an invoice in Odoo.
 */
export function overdueFromInvoices(invoices: readonly { residual: number; dueDate: string | null; refund?: boolean }[], today: string, graceDays = 0): OverdueSummary {
  const rows = invoices
    .filter((inv) => !inv.refund && inv.residual > OVERDUE_TOLERANCE && inv.dueDate)
    .map((inv) => ({ residual: inv.residual, dueDate: inv.dueDate!.slice(0, 10) }));
  return summarize(rows, today, graceDays, 'odoo');
}

/**
 * Overdue counted from the dealer's own web credit orders (fallback when Odoo cannot be read): invoices from the
 * last status sync that are unpaid, split by due date and grace days like {@link overdueFromInvoices}.
 * Orders not invoiced yet have no due date and never count.
 */
export function overdueFromWebOrders(
  dealer: { id: string; odooPartnerId: number | null },
  orders: readonly { scope: string; paymentMethod: string; status: string; odoo?: { progress?: { invoices: { amountResidual: number; dueDate: string | null; paymentState: string }[] } } | null }[],
  today: string,
  graceDays = 0,
): OverdueSummary {
  const rows: { residual: number; dueDate: string }[] = [];
  for (const order of orders) {
    if (order.paymentMethod !== 'CREDIT' || RELEASED.has(order.status) || !isDealerScope(order.scope, dealer.id, dealer.odooPartnerId)) continue;
    for (const inv of order.odoo?.progress?.invoices ?? []) {
      if (SETTLED.has(inv.paymentState) || inv.amountResidual <= OVERDUE_TOLERANCE || !inv.dueDate) continue;
      rows.push({ residual: inv.amountResidual, dueDate: inv.dueDate.slice(0, 10) });
    }
  }
  return summarize(rows, today, graceDays, 'web');
}

/** Credit ordering is locked while anything is past due beyond the grace days; cash orders stay open. */
export function isOverdueLocked(overdue: OverdueSummary | null): boolean {
  return Boolean(overdue && overdue.count > 0);
}

/** Past due but still inside the grace days: credit still works, the dealer is warned. */
export function isInGrace(overdue: OverdueSummary | null): boolean {
  return Boolean(overdue && overdue.count === 0 && overdue.grace && overdue.grace.count > 0);
}

const bahtText = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDateText = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

/** `2026-11-16` → `16 พ.ย. 2569` (Thai Buddhist year). */
export function thaiDate(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(at.getTime()) ? day : thaiDateText.format(at);
}

/** Message shown at checkout and on the account page while credit is locked. */
export function overdueLockMessage(overdue: OverdueSummary): string {
  const past = overdue.graceDays > 0 ? `เลยกำหนดชำระเกิน ${overdue.graceDays} วัน` : 'เลยกำหนดชำระ';
  return `มียอด${past} ${overdue.count} ใบ รวม ${bahtText.format(overdue.amount)} บาท · ชำระก่อนจึงจะสั่งแบบเครดิตได้ (สั่งเงินสดได้ตามปกติ)`;
}

/** Warning while past-due invoices are inside the grace days: credit still open until `lockDate`. */
export function overdueGraceMessage(overdue: OverdueSummary): string {
  const g = overdue.grace!;
  return `มีใบแจ้งหนี้เลยกำหนดชำระ ${g.count} ใบ รวม ${bahtText.format(g.amount)} บาท · ชำระภายใน ${thaiDate(addDays(g.lockDate, -1))} ไม่เช่นนั้นระบบจะปิดสั่งแบบเครดิตตั้งแต่ ${thaiDate(g.lockDate)} (สั่งเงินสดได้ตามปกติ)`;
}
