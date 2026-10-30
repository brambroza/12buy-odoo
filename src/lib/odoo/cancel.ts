/**
 * Cancels a web order's sale order in Odoo after the admin cancelled it on the web, so both sides
 * agree. Draft invoices are cancelled with the SO; a posted invoice stops the cancel (accounting must
 * credit-note it first) and the admin sees why.
 */
import type { OdooSync, ProtoOrder } from '@/lib/shop/types';
import { odooSearchRead, odooWrite } from './rpc';

type SaleOrderState = { id: number; state: string; invoice_ids: number[] };
type MoveState = { id: number; name: string | false; state: string };

export type OdooCancelResult = NonNullable<OdooSync['cancel']>;

/** True when the order has an SO in Odoo that may still need cancelling. */
export function needsOdooCancel(order: Pick<ProtoOrder, 'odoo'>): boolean {
  return Boolean(order.odoo?.saleOrderId) && order.odoo?.cancel?.ok !== true;
}

/**
 * Cancels the SO (and its draft invoices) behind `order`. Never throws: the outcome is returned so the
 * caller can store it on the order and tell the admin.
 */
export async function cancelOrderInOdoo(order: ProtoOrder): Promise<OdooCancelResult> {
  const at = new Date().toISOString();
  const saleOrderId = order.odoo?.saleOrderId;
  if (!saleOrderId) return { ok: true, at, note: 'ไม่มี SO ใน Odoo' };
  try {
    const [so] = await odooSearchRead<SaleOrderState>('sale.order', [['id', '=', saleOrderId]], ['id', 'state', 'invoice_ids'], { limit: 1 });
    if (!so) return { ok: true, at, note: 'ไม่พบ SO ใน Odoo (อาจถูกลบแล้ว)' };
    if (so.state === 'cancel') return { ok: true, at, note: 'SO ถูกยกเลิกใน Odoo อยู่แล้ว' };

    const moves = so.invoice_ids.length ? await odooSearchRead<MoveState>('account.move', [['id', 'in', so.invoice_ids]], ['id', 'name', 'state']) : [];
    const posted = moves.filter((m) => m.state === 'posted');
    if (posted.length) {
      return { ok: false, at, error: `ใบแจ้งหนี้ ${posted.map((m) => m.name || m.id).join(', ')} ถูกบันทึกบัญชีแล้ว ให้บัญชีออกใบลดหนี้ใน Odoo ก่อน แล้วค่อยยกเลิก SO` };
    }
    const drafts = moves.filter((m) => m.state === 'draft').map((m) => m.id);
    if (drafts.length) await odooWrite('account.move', 'button_cancel', [drafts]);
    // `disable_cancel_warning` skips Odoo's "send cancellation email?" wizard; the dealer is told by the web.
    await odooWrite('sale.order', 'action_cancel', [[saleOrderId]], { context: { disable_cancel_warning: true } });
    return { ok: true, at, note: drafts.length ? `ยกเลิก SO และใบแจ้งหนี้ร่าง ${drafts.length} ใบแล้ว` : 'ยกเลิก SO ใน Odoo แล้ว' };
  } catch (error) {
    return { ok: false, at, error: error instanceof Error ? error.message : String(error) };
  }
}
