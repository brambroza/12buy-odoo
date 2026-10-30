/**
 * Posts internal notes ("log messages") to Odoo's chatter for web events, with the dealer's
 * slip attached, so sales and accounting see the payment on the sale order and on its invoice.
 * Writes go through `odooWrite` (allow-listed; only when ODOO_READ_ONLY=false).
 */
import { formatAmount } from '@/lib/money';
import type { CreditPayment, ProtoOrder } from '@/lib/shop/types';
import { odooRead, odooWrite } from './rpc';

/** Image attached to the note: file name, MIME type and raw bytes. */
export type NoteAttachment = { name: string; mimetype: string; body: Buffer };

/** Escapes text for the HTML body of a chatter note. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/** Which credit-payment event the note describes. */
export type CreditPaymentEvent = 'SUBMITTED' | 'VERIFIED' | 'REJECTED';

const EVENT_TITLE: Record<CreditPaymentEvent, string> = {
  SUBMITTED: 'ดีลเลอร์แจ้งโอนชำระ (ออเดอร์เครดิต) จากเว็บ',
  VERIFIED: 'แอดมินตรวจสลิปชำระเครดิตแล้ว ยอดถูกต้อง',
  REJECTED: 'แอดมินปฏิเสธสลิปชำระเครดิต',
};

/**
 * HTML body of the chatter note for a credit payment event: who, how much, when, the dealer's remark,
 * and for a rejection its reason. Pure, so it can be tested without Odoo.
 */
export function buildCreditPaymentNote(order: Pick<ProtoOrder, 'ref' | 'dealerName' | 'total'>, payment: CreditPayment, event: CreditPaymentEvent, extra: { outstanding?: number; reviewer?: string | null } = {}): string {
  const rows: [string, string][] = [
    ['ออเดอร์เว็บ', order.ref],
    ['ร้าน', order.dealerName],
    ['ยอดที่แจ้งโอน', `${formatAmount(payment.amount)} บาท`],
    ['แจ้งเมื่อ', dateTime(payment.uploadedAt)],
  ];
  if (extra.outstanding !== undefined) rows.push(['ยอดค้างก่อนรายการนี้', `${formatAmount(extra.outstanding)} บาท`]);
  if (payment.note) rows.push(['หมายเหตุจากร้าน', payment.note]);
  if (event !== 'SUBMITTED' && payment.reviewedAt) rows.push(['ตรวจเมื่อ', dateTime(payment.reviewedAt)]);
  if (extra.reviewer) rows.push(['ตรวจโดย', extra.reviewer]);
  if (event === 'REJECTED' && payment.rejectReason) rows.push(['เหตุผล', payment.rejectReason]);
  const list = rows.map(([k, v]) => `<li><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</li>`).join('');
  const footer = event === 'SUBMITTED'
    ? 'สลิปแนบมากับข้อความนี้ · บัญชีตรวจเงินเข้าแล้วลงรับชำระ (Register Payment) ในใบแจ้งหนี้ · สถานะบนเว็บจะเป็น “ชำระแล้ว” อัตโนมัติ'
    : event === 'VERIFIED' ? 'บัญชีลงรับชำระในใบแจ้งหนี้ได้เลย' : 'ร้านต้องส่งสลิปใหม่จากหน้าออเดอร์บนเว็บ';
  return `<p><b>${escapeHtml(EVENT_TITLE[event])}</b></p><ul>${list}</ul><p>${escapeHtml(footer)}</p>`;
}

let contentFieldCache: 'datas' | 'raw' | null = null;

/**
 * Field that takes the file content of an `ir.attachment` over RPC (base64 either way):
 * `datas` up to Odoo 18, `raw` on Odoo 19+ where `datas` no longer exists. Read once per process.
 */
export async function attachmentContentField(): Promise<'datas' | 'raw'> {
  if (contentFieldCache) return contentFieldCache;
  const fields = await odooRead<Record<string, unknown>>('ir.attachment', 'fields_get', [], { attributes: ['type'] });
  contentFieldCache = 'datas' in fields ? 'datas' : 'raw';
  return contentFieldCache;
}

/**
 * Uploads `attachment` as an `ir.attachment` of `model`/`id` and checks Odoo really stored the bytes
 * (Odoo ignores unknown fields silently, which would leave an empty file). Returns the attachment id.
 */
export async function uploadAttachment(model: string, id: number, attachment: NoteAttachment): Promise<number> {
  const field = await attachmentContentField();
  const created = await odooWrite<number | number[]>('ir.attachment', 'create', [[{
    name: attachment.name, mimetype: attachment.mimetype, [field]: attachment.body.toString('base64'), res_model: model, res_id: id,
  }]]);
  const attachmentId = Array.isArray(created) ? created[0] : created;
  const [stored] = await odooRead<{ file_size: number }[]>('ir.attachment', 'read', [[attachmentId], ['file_size']]);
  if (!stored || stored.file_size !== attachment.body.length) {
    throw new Error(`Odoo เก็บไฟล์สลิปไม่ครบ (ได้ ${stored?.file_size ?? 0} จาก ${attachment.body.length} ไบต์ ผ่านฟิลด์ ${field})`);
  }
  return attachmentId;
}

/**
 * Posts one internal note (`mail.mt_note`, no e-mail to followers) on `model`/`id`, with `attachment`
 * uploaded as an `ir.attachment` of that record first. `body` is HTML (`body_is_html`, Odoo 17+;
 * without it Odoo escapes the markup and shows the tags as text). Returns the new `mail.message` id.
 */
export async function postNote(model: 'sale.order' | 'account.move', id: number, body: string, attachment?: NoteAttachment | null): Promise<number> {
  const attachmentIds: number[] = attachment ? [await uploadAttachment(model, id, attachment)] : [];
  const message = await odooWrite<number | number[] | { id: number }>(model, 'message_post', [[id]], {
    body, body_is_html: true, message_type: 'comment', subtype_xmlid: 'mail.mt_note', ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
  });
  if (typeof message === 'number') return message;
  if (Array.isArray(message)) return message[0];
  return message?.id ?? 0;
}
