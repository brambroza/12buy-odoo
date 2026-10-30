/**
 * Notification fan-out. `notify*` never throws: every event is written to the in-app inbox first, then
 * pushed to LINE for users who linked their account (dealers) or to the staff group (back office).
 * Failures are recorded on the row (`channels`) and logged, so the order flow is never blocked.
 */
import { db } from '@/lib/db/client';
import { rows } from '@/lib/db/rows';
import { findDealerByPartnerId } from '@/lib/dealers/repo';
import { logger } from '@/lib/logger';
import { formatAmount } from '@/lib/money';
import { absoluteUrl } from '@/lib/seo';
import { dealerIdFromSession, partnerIdFromSession } from '@/lib/shop/odoo-sync';
import { ORDER_STATUS_LABELS, type OrderStatus, type ProtoOrder } from '@/lib/shop/types';
import { flexCard, linePush } from './line';
import { getLineConfig } from './line-config';
import { insertNotification, setNotificationChannels, type NewNotification } from './repo';

const log = logger('notify');

export type DealerNotification = Omit<NewNotification, 'dealerId' | 'userId'> & { dealerId: string };

/** LINE user ids of a dealer's active logins that linked LINE. */
async function dealerLineTargets(dealerId: string): Promise<string[]> {
  const users = rows<{ lineUserId: string | null }>(await db().from('User').select('lineUserId').eq('dealerId', dealerId).eq('isActive', true).not('lineUserId', 'is', null));
  return [...new Set(users.map((u) => u.lineUserId).filter((id): id is string => Boolean(id)))];
}

/**
 * Writes an inbox row for the dealer and pushes a LINE card to every linked user of the shop.
 * Returns the row id, or null when even the inbox write failed.
 */
export async function notifyDealer(input: DealerNotification, line?: { rows?: { label: string; value: string }[]; buttonLabel?: string }): Promise<string | null> {
  let rowId: string | null = null;
  try {
    rowId = (await insertNotification({ ...input, userId: null })).id;
  } catch (error) {
    log.error('inbox write failed', { type: input.type, dealerId: input.dealerId, error });
  }
  try {
    const targets = await dealerLineTargets(input.dealerId);
    if (!targets.length) {
      if (rowId) await setNotificationChannels(rowId, { line: { skipped: 'no-linked-user' } });
      return rowId;
    }
    const message = flexCard({ title: input.title, body: input.body, rows: line?.rows, button: input.href ? { label: line?.buttonLabel ?? 'เปิดดูในเว็บ', url: absoluteUrl(input.href) } : undefined });
    const results = await Promise.all(targets.map((to) => linePush(to, [message])));
    const failed = results.filter((r) => !r.ok);
    if (rowId) await setNotificationChannels(rowId, { line: failed.length ? { ok: false, sent: results.length - failed.length, error: (failed[0] as { error: string }).error } : { ok: true, sent: results.length } });
  } catch (error) {
    log.error('line fan-out failed', { type: input.type, error });
  }
  return rowId;
}

/** Pushes a card to the staff LINE group (new orders, slips, failures). No inbox row: the bell computes those live. */
export async function notifyStaffGroup(input: { title: string; body: string; href?: string; rows?: { label: string; value: string }[] }): Promise<void> {
  try {
    const { adminGroupId } = await getLineConfig();
    if (!adminGroupId) return;
    const result = await linePush(adminGroupId, [flexCard({ title: input.title, body: input.body, rows: input.rows, button: input.href ? { label: 'เปิดหลังบ้าน', url: absoluteUrl(input.href) } : undefined, accent: '#1f2937' })]);
    if (!result.ok) log.warn('staff group push failed', { error: result.error });
  } catch (error) {
    log.error('staff group push failed', { error });
  }
}

/** Dealer behind an order (web dealer, or the dealer linked to the Odoo partner of a staff order). */
export async function dealerIdForOrder(order: Pick<ProtoOrder, 'sessionId'>): Promise<string | null> {
  const direct = dealerIdFromSession(order.sessionId);
  if (direct) return direct;
  const partnerId = partnerIdFromSession(order.sessionId);
  if (!partnerId) return null;
  return (await findDealerByPartnerId(partnerId).catch(() => null))?.id ?? null;
}

const STATUS_COPY: Record<Exclude<OrderStatus, 'PENDING'>, { title: string; body: (o: ProtoOrder) => string }> = {
  PREPARING: { title: 'ยืนยันออเดอร์แล้ว กำลังจัดสินค้า', body: (o) => `ออเดอร์ ${o.ref} ยอด ${formatAmount(o.total)} บาท ได้รับการยืนยันแล้ว คลังกำลังจัดสินค้าให้` },
  SHIPPED: { title: 'จัดส่งแล้ว', body: (o) => `ออเดอร์ ${o.ref} ออกจากคลังแล้ว${o.trackingRef ? ` เลขพัสดุ ${o.trackingRef}` : ''} ขนส่ง ${o.carrier}` },
  INVOICED: { title: 'วางบิลแล้ว', body: (o) => `ออกใบแจ้งหนี้สำหรับออเดอร์ ${o.ref} แล้ว${o.odoo?.progress?.invoices[0]?.dueDate ? ` ครบกำหนด ${new Date(o.odoo.progress.invoices[0].dueDate).toLocaleDateString('th-TH', { dateStyle: 'medium' })}` : ''}` },
  PAID: { title: 'ชำระเงินครบแล้ว ขอบคุณค่ะ', body: (o) => `ออเดอร์ ${o.ref} ชำระครบ ${formatAmount(o.total)} บาท แล้ว` },
  CANCELLED: { title: 'ออเดอร์ถูกยกเลิก', body: (o) => `ออเดอร์ ${o.ref} ถูกยกเลิกแล้ว หากไม่ได้ตั้งใจ ทัก LINE ทีมขายได้เลย` },
};

/** Tells the dealer an order moved to `status` (from the admin, the Odoo sync or a cancel). */
export async function notifyOrderStatus(order: ProtoOrder, status: Exclude<OrderStatus, 'PENDING'> = order.status as Exclude<OrderStatus, 'PENDING'>): Promise<void> {
  const dealerId = await dealerIdForOrder(order);
  const copy = STATUS_COPY[status];
  if (!dealerId || !copy) return;
  await notifyDealer(
    { dealerId, type: `order.${status.toLowerCase()}`, title: copy.title, body: copy.body(order), href: `/shop/orders/${order.id}` },
    { rows: [{ label: 'ออเดอร์', value: order.ref }, { label: 'สถานะ', value: ORDER_STATUS_LABELS[status] }, { label: 'ยอด', value: `${formatAmount(order.total)} บาท` }], buttonLabel: 'ดูออเดอร์' },
  );
}

/** New web order: thank the dealer in-app and ping the staff group. */
export async function notifyOrderPlaced(order: ProtoOrder): Promise<void> {
  const dealerId = await dealerIdForOrder(order);
  const pay = order.paymentMethod === 'CREDIT' ? 'เครดิต' : order.payment.slipFile ? 'เงินสด · แนบสลิปแล้ว' : 'เงินสด · รอสลิป';
  await Promise.all([
    dealerId ? notifyDealer({ dealerId, type: 'order.placed', title: 'รับออเดอร์แล้ว', body: `ออเดอร์ ${order.ref} ยอด ${formatAmount(order.total)} บาท (${pay}) ฝ่ายขายจะยืนยันภายใน 2 ชั่วโมงทำการ`, href: `/shop/orders/${order.id}` }, { rows: [{ label: 'ออเดอร์', value: order.ref }, { label: 'ยอด', value: `${formatAmount(order.total)} บาท` }, { label: 'ชำระ', value: pay }], buttonLabel: 'ดูออเดอร์' }) : null,
    notifyStaffGroup({ title: 'ออเดอร์ใหม่จากเว็บ', body: `${order.dealerName} สั่ง ${order.lines.length} รายการ ยอด ${formatAmount(order.total)} บาท`, href: `/admin/orders?open=${order.id}`, rows: [{ label: 'ออเดอร์', value: order.ref }, { label: 'ชำระ', value: pay }, { label: 'ส่งที่', value: order.address.slice(0, 80) }] }),
  ]);
}

/** Credit-payment review result for the dealer. */
export async function notifyCreditPaymentReview(order: ProtoOrder, payment: { amount: number; status: 'VERIFIED' | 'REJECTED'; rejectReason?: string | null }): Promise<void> {
  const dealerId = await dealerIdForOrder(order);
  if (!dealerId) return;
  const ok = payment.status === 'VERIFIED';
  await notifyDealer({
    dealerId, type: ok ? 'credit_payment.verified' : 'credit_payment.rejected',
    title: ok ? 'ตรวจยอดโอนแล้ว' : 'สลิปไม่ผ่าน กรุณาส่งใหม่',
    body: ok ? `รับยอดโอน ${formatAmount(payment.amount)} บาท สำหรับออเดอร์ ${order.ref} แล้ว บัญชีจะอัปเดตสถานะชำระให้` : `สลิป ${formatAmount(payment.amount)} บาท ของออเดอร์ ${order.ref} ไม่ผ่าน${payment.rejectReason ? `: ${payment.rejectReason}` : ''} กรุณาส่งสลิปใหม่`,
    href: `/shop/orders/${order.id}#credit-payment`,
  }, { rows: [{ label: 'ออเดอร์', value: order.ref }, { label: 'ยอด', value: `${formatAmount(payment.amount)} บาท` }] });
}

/** Cash slip checked by staff. */
export async function notifySlipVerified(order: ProtoOrder): Promise<void> {
  const dealerId = await dealerIdForOrder(order);
  if (!dealerId) return;
  await notifyDealer({ dealerId, type: 'slip.verified', title: 'ตรวจสลิปแล้ว', body: `สลิปของออเดอร์ ${order.ref} ถูกต้อง ฝ่ายขายกำลังยืนยันออเดอร์`, href: `/shop/orders/${order.id}` });
}

/** Staff heads-up when an Odoo push or cancel fails (so nobody finds out from the dealer). */
export async function notifyOdooFailure(order: ProtoOrder, what: string, error: string): Promise<void> {
  await notifyStaffGroup({ title: `Odoo: ${what}ไม่สำเร็จ`, body: `${order.ref} · ${order.dealerName}\n${error.slice(0, 300)}`, href: `/admin/orders?open=${order.id}`, rows: [{ label: 'ออเดอร์', value: order.ref }] });
}

/** Welcome a newly approved dealer (in-app; LINE can be linked from the account page afterwards). */
export async function notifyDealerApproved(dealerId: string, shopName: string): Promise<void> {
  await notifyDealer({ dealerId, type: 'dealer.approved', title: `ยินดีต้อนรับ ${shopName}`, body: 'บัญชีดีลเลอร์เปิดใช้งานแล้ว ค้นหาด้วยขนาดยางเพื่อดูราคาของร้าน และเชื่อม LINE ในหน้าข้อมูลร้านเพื่อรับแจ้งเตือนทุกสถานะ', href: '/shop/account' });
}
