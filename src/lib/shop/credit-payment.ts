/**
 * Pure rules for dealer-reported payments on CREDIT orders (no DB, no Odoo), shared by the
 * dealer order page, the admin inbox and the dashboard. Storage lives in `store.ts`,
 * the Odoo chatter note in `@/lib/odoo/chatter`.
 */
import type { CreditPayment, OrderStatus, ProtoOrder } from './types';

/** Credit orders the dealer may pay from the web: confirmed (SO exists or sales moved it on), not yet paid or cancelled. */
const PAYABLE_STATUSES = new Set<OrderStatus>(['PREPARING', 'SHIPPED', 'INVOICED']);

type OrderLike = Pick<ProtoOrder, 'paymentMethod' | 'status' | 'total' | 'payment' | 'odoo'>;

/** Largest amount a dealer may report in one transfer (sanity cap, baht). */
export const MAX_CREDIT_PAYMENT = 10_000_000;

/** Invoice payment states that no longer owe anything. */
const SETTLED = new Set(['paid', 'in_payment', 'reversed']);

/** All credit payments reported on an order, oldest first (empty for cash orders). */
export function creditPayments(order: Pick<ProtoOrder, 'payment'>): CreditPayment[] {
  return order.payment.credits ?? [];
}

/** Payments the admin still has to check. */
export function pendingCreditPayments(order: Pick<ProtoOrder, 'payment'>): CreditPayment[] {
  return creditPayments(order).filter((p) => p.status === 'PENDING');
}

/** True when the dealer may report a transfer against this order from the order page. */
export function canPayCredit(order: Pick<OrderLike, 'paymentMethod' | 'status'>): boolean {
  return order.paymentMethod === 'CREDIT' && PAYABLE_STATUSES.has(order.status);
}

/**
 * What the dealer still owes on a credit order, in baht:
 * the unpaid residual of its posted Odoo invoices when the status sync has read them,
 * otherwise the order total minus payments the admin already verified. Never below zero.
 */
export function creditOutstanding(order: OrderLike): number {
  const invoices = order.odoo?.progress?.invoices ?? [];
  if (invoices.length) {
    return round2(invoices.filter((inv) => !SETTLED.has(inv.paymentState)).reduce((sum, inv) => sum + Math.max(0, inv.amountResidual), 0));
  }
  const verified = creditPayments(order).filter((p) => p.status === 'VERIFIED').reduce((sum, p) => sum + p.amount, 0);
  return round2(Math.max(0, order.total - verified));
}

/** Sum of transfers reported but not yet checked (shown as "แจ้งโอนแล้ว รอตรวจ"). */
export function creditPendingAmount(order: Pick<ProtoOrder, 'payment'>): number {
  return round2(pendingCreditPayments(order).reduce((sum, p) => sum + p.amount, 0));
}

/** Slip file names a dealer of this order may view: the cash slip and every credit payment slip. */
export function orderSlipFiles(order: Pick<ProtoOrder, 'payment'>): string[] {
  return [order.payment.slipFile, ...creditPayments(order).map((p) => p.slipFile)].filter((name): name is string => Boolean(name));
}

/**
 * Validates a dealer-typed amount: a positive number of baht, at most 2 decimals, within the cap.
 * Returns the parsed amount or a Thai reason.
 */
export function parseCreditAmount(raw: unknown): { ok: true; amount: number } | { ok: false; reason: string } {
  const text = String(raw ?? '').replace(/[,\s฿]/g, '');
  if (!text) return { ok: false, reason: 'กรอกยอดที่โอน' };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'ยอดที่โอนต้องมากกว่า 0' };
  if (amount > MAX_CREDIT_PAYMENT) return { ok: false, reason: 'ยอดที่โอนสูงเกินไป ตรวจสอบอีกครั้ง' };
  if (Math.round(amount * 100) !== amount * 100) return { ok: false, reason: 'ยอดที่โอนใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง' };
  return { ok: true, amount: round2(amount) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
