/**
 * Reads how far Odoo has taken web sale orders (delivery, invoice, payment) — read-only.
 * The web order status follows Odoo once the SO exists: the warehouse validates the picking
 * and accounting posts/reconciles the invoice in Odoo, never in the web app.
 */
import type { OrderStatus } from '@/lib/shop/types';
import { odooSearchRead } from './rpc';

type SaleOrderProgressRead = {
  id: number;
  name: string;
  state: 'draft' | 'sent' | 'sale' | 'cancel';
  delivery_status: 'pending' | 'started' | 'partial' | 'full' | false;
  invoice_ids: number[];
};
type InvoiceRead = { id: number; name: string; move_type: string; state: 'draft' | 'posted' | 'cancel'; payment_state: string; amount_residual: number; invoice_date_due: string | false };

export type OdooProgress = {
  saleOrderId: number;
  state: SaleOrderProgressRead['state'];
  deliveryStatus: SaleOrderProgressRead['delivery_status'];
  /** Posted customer invoices only (drafts and credit notes are ignored). */
  invoices: { id: number; name: string; paymentState: string; amountResidual: number; dueDate: string | null }[];
};

const PAID_STATES = new Set(['paid', 'in_payment']);

/** Batch-reads SO state, delivery status and posted invoices for the given sale order ids. */
export async function readOdooProgress(saleOrderIds: number[]): Promise<Map<number, OdooProgress>> {
  const result = new Map<number, OdooProgress>();
  if (!saleOrderIds.length) return result;
  const orders = await odooSearchRead<SaleOrderProgressRead>('sale.order', [['id', 'in', saleOrderIds]], ['id', 'name', 'state', 'delivery_status', 'invoice_ids'], { limit: saleOrderIds.length });
  const invoiceIds = orders.flatMap((o) => o.invoice_ids);
  const invoices = invoiceIds.length
    ? await odooSearchRead<InvoiceRead>('account.move', [['id', 'in', invoiceIds]], ['id', 'name', 'move_type', 'state', 'payment_state', 'amount_residual', 'invoice_date_due'], { limit: invoiceIds.length })
    : [];
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  for (const order of orders) {
    result.set(order.id, {
      saleOrderId: order.id,
      state: order.state,
      deliveryStatus: order.delivery_status,
      invoices: order.invoice_ids
        .map((id) => byId.get(id))
        .filter((inv): inv is InvoiceRead => Boolean(inv && inv.state === 'posted' && inv.move_type === 'out_invoice'))
        .map((inv) => ({ id: inv.id, name: inv.name, paymentState: inv.payment_state, amountResidual: inv.amount_residual, dueDate: inv.invoice_date_due || null })),
    });
  }
  return result;
}

/**
 * Web status implied by Odoo: cancelled SO → CANCELLED; every posted invoice paid → PAID;
 * a posted invoice → INVOICED; delivery fully done → SHIPPED; otherwise PREPARING.
 * A partial delivery stays PREPARING (shown to the dealer as "ส่งบางส่วน").
 */
export function webStatusFromOdoo(progress: OdooProgress): OrderStatus {
  if (progress.state === 'cancel') return 'CANCELLED';
  if (progress.state !== 'sale') return 'PREPARING';
  if (progress.invoices.length && progress.invoices.every((inv) => PAID_STATES.has(inv.paymentState))) return 'PAID';
  if (progress.invoices.length) return 'INVOICED';
  if (progress.deliveryStatus === 'full') return 'SHIPPED';
  return 'PREPARING';
}
