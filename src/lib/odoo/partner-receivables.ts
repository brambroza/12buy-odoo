/**
 * Open customer invoices of an Odoo partner (read-only), for the dealer's balance and the overdue lock.
 * Covers every posted invoice/credit note of the customer, not only the ones from web orders, so the shop
 * shows the same debt as Odoo's Total Receivable.
 */
import { odooSearchRead } from './rpc';

type MoveRead = {
  id: number;
  name: string;
  move_type: 'out_invoice' | 'out_refund';
  amount_residual: number;
  invoice_date_due: string | false;
  invoice_origin: string | false;
};

/** One unpaid posted invoice (or unapplied credit note, `residual` negative) of the customer. */
export type OdooOpenInvoice = { id: number; name: string; refund: boolean; residual: number; dueDate: string | null; origin: string | null };

/**
 * Posted, not (fully) paid customer invoices and credit notes of the partner and its contacts, soonest due first.
 * Capped at 200 rows: a dealer with more open invoices than that has bigger problems than this list.
 */
export async function readOpenInvoices(partnerId: number): Promise<OdooOpenInvoice[]> {
  const rows = await odooSearchRead<MoveRead>('account.move', [
    ['partner_id', 'child_of', partnerId],
    ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['state', '=', 'posted'],
    ['payment_state', 'in', ['not_paid', 'partial']],
  ], ['id', 'name', 'move_type', 'amount_residual', 'invoice_date_due', 'invoice_origin'], { limit: 200, order: 'invoice_date_due asc, id asc' });
  return rows.map((r) => {
    const refund = r.move_type === 'out_refund';
    const amount = Math.abs(Number(r.amount_residual) || 0);
    return { id: r.id, name: r.name, refund, residual: refund ? -amount : amount, dueDate: r.invoice_date_due || null, origin: r.invoice_origin || null };
  });
}
