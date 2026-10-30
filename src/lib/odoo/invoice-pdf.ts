/**
 * Invoice / tax-invoice PDF from Odoo. Odoo Online exposes no RPC to render a report, but every
 * invoice that accounting printed or e-mailed has its PDF stored as an `ir.attachment` on the move.
 * We read that (read-only) and stream it; when none exists yet the dealer can ask accounting for it.
 */
import { odooRead, odooSearchRead } from './rpc';

type AttachmentMeta = { id: number; name: string; mimetype: string; create_date: string };
type MoveMeta = { id: number; name: string | false; partner_id: [number, string] | false; commercial_partner_id: [number, string] | false; move_type: string; state: string };

export type InvoicePdf = { ok: true; name: string; bytes: Buffer } | { ok: false; reason: 'no-pdf' | 'not-found' | 'forbidden' };

/** True when `moveId` is a customer invoice of the given partner (or its company). */
export async function invoiceBelongsTo(moveId: number, partnerIds: number[]): Promise<MoveMeta | null> {
  const [move] = await odooSearchRead<MoveMeta>('account.move', [['id', '=', moveId]], ['id', 'name', 'partner_id', 'commercial_partner_id', 'move_type', 'state'], { limit: 1 });
  if (!move || !['out_invoice', 'out_refund'].includes(move.move_type)) return null;
  const owners = [move.partner_id ? move.partner_id[0] : null, move.commercial_partner_id ? move.commercial_partner_id[0] : null];
  return owners.some((id) => id !== null && partnerIds.includes(id)) ? move : null;
}

/** Newest PDF attachment of the move, or why there is none. */
export async function fetchInvoicePdf(moveId: number, partnerIds: number[]): Promise<InvoicePdf> {
  const move = await invoiceBelongsTo(moveId, partnerIds);
  if (!move) return { ok: false, reason: partnerIds.length ? 'forbidden' : 'not-found' };
  const [attachment] = await odooSearchRead<AttachmentMeta>('ir.attachment', [['res_model', '=', 'account.move'], ['res_id', '=', moveId], ['mimetype', '=', 'application/pdf']], ['id', 'name', 'mimetype', 'create_date'], { order: 'id desc', limit: 1 });
  if (!attachment) return { ok: false, reason: 'no-pdf' };
  const [data] = await odooRead<{ id: number; datas: string | false }[]>('ir.attachment', 'read', [[attachment.id], ['datas']]);
  if (!data?.datas) return { ok: false, reason: 'no-pdf' };
  return { ok: true, name: attachment.name.toLowerCase().endsWith('.pdf') ? attachment.name : `${move.name || `invoice-${moveId}`}.pdf`, bytes: Buffer.from(data.datas, 'base64') };
}
