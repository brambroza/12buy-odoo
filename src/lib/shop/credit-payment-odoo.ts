/**
 * Sends a credit payment event to Odoo as a chatter note on the sale order and its invoice
 * (slip attached), and records the outcome on the payment. Never throws: an Odoo that is down
 * or in read-only mode leaves `odoo.error` on the payment and the admin can resend from the inbox.
 */
import { buildCreditPaymentNote, postNote, type CreditPaymentEvent, type NoteAttachment } from '@/lib/odoo/chatter';
import { creditOutstanding } from './credit-payment';
import * as store from './store';
import { readSlip } from './uploads';
import type { CreditPayment, CreditPaymentOdooLog, ProtoOrder } from './types';

const EVENT_OF: Record<CreditPayment['status'], CreditPaymentEvent> = { PENDING: 'SUBMITTED', VERIFIED: 'VERIFIED', REJECTED: 'REJECTED' };

/** Can this payment be logged to Odoo at all (the order has to be in Odoo first)? */
export function canLogCreditPayment(order: Pick<ProtoOrder, 'odoo'>): boolean {
  return Boolean(order.odoo?.saleOrderId);
}

/** Payments whose last chatter note failed (or was never posted) and can be sent again. */
export function creditPaymentsToResend(order: Pick<ProtoOrder, 'odoo' | 'payment'>): CreditPayment[] {
  if (!canLogCreditPayment(order)) return [];
  return (order.payment.credits ?? []).filter((p) => !p.odoo || p.odoo.error);
}

/**
 * Posts the note for the payment's current status (submitted / verified / rejected). The slip is attached
 * only on the first note (SUBMITTED); later notes refer to it. `reviewer` names the staff member on review notes.
 */
export async function logCreditPaymentToOdoo(order: ProtoOrder, payment: CreditPayment, options: { reviewer?: string | null; outstanding?: number } = {}): Promise<CreditPaymentOdooLog> {
  const at = new Date().toISOString();
  let log: CreditPaymentOdooLog;
  try {
    const saleOrderId = order.odoo?.saleOrderId;
    if (!saleOrderId) throw new Error('ออเดอร์นี้ยังไม่มีใบสั่งขายใน Odoo');
    const event = EVENT_OF[payment.status];
    const body = buildCreditPaymentNote(order, payment, event, { reviewer: options.reviewer, outstanding: options.outstanding ?? (event === 'SUBMITTED' ? creditOutstanding(order) : undefined) });
    const attachment = event === 'SUBMITTED' ? await slipAttachment(order, payment) : null;
    const messageId = await postNote('sale.order', saleOrderId, body, attachment);
    let invoiceMessageId: number | null = null;
    const invoiceId = order.odoo?.invoice?.id;
    if (invoiceId) {
      try {
        invoiceMessageId = await postNote('account.move', invoiceId, body, attachment);
      } catch (error) {
        console.error('[credit-payment] invoice note failed', error instanceof Error ? error.message : error);
      }
    }
    log = { messageId, invoiceMessageId, error: null, at };
  } catch (error) {
    log = { messageId: payment.odoo?.messageId ?? null, invoiceMessageId: payment.odoo?.invoiceMessageId ?? null, error: error instanceof Error ? error.message : String(error), at };
  }
  await store.setCreditPaymentOdooLog(order.id, payment.id, log);
  return log;
}

/** The stored slip as a chatter attachment named after the order; null when the file cannot be read. */
async function slipAttachment(order: Pick<ProtoOrder, 'ref'>, payment: CreditPayment): Promise<NoteAttachment | null> {
  const slip = await readSlip(payment.slipFile);
  if (!slip) return null;
  const ext = payment.slipFile.split('.').pop() ?? 'jpg';
  return { name: `slip-${order.ref}-${payment.id}.${ext}`, mimetype: slip.contentType, body: slip.body };
}
