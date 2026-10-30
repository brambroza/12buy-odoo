/**
 * Numbers and the "to do today" list for the back-office dashboard. Pure functions over data the page
 * loads, so they are easy to test. Dates are bucketed by Thai calendar day (Asia/Bangkok).
 */
import { pendingCreditPayments } from '@/lib/shop/credit-payment';
import type { OrderStatus, ProtoOrder } from '@/lib/shop/types';

export const TIME_ZONE = 'Asia/Bangkok';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Current time in ms; one place to read the clock for a dashboard render (keeps render code pure). */
export function currentTime(): number {
  return Date.now();
}

/** Thai calendar day of an instant as `YYYY-MM-DD`. */
export function thaiDay(at: string | number | Date): string {
  return dayFormat.format(new Date(at));
}

type OrderLike = Pick<ProtoOrder, 'id' | 'ref' | 'dealerName' | 'status' | 'total' | 'createdAt' | 'paymentMethod' | 'payment' | 'odoo'>;

export type SalesSummary = {
  /** Orders that are not cancelled. */
  orders: number;
  /** Sum of `total` of orders that are not cancelled. */
  sales: number;
  /** Paid orders' total (status PAID). */
  paid: number;
  today: { orders: number; sales: number };
  month: { orders: number; sales: number };
  /** Previous calendar month, for the trend. */
  lastMonth: { orders: number; sales: number };
  byStatus: Record<OrderStatus, number>;
  /** Last `days` Thai days, oldest first, with sales of non-cancelled orders. */
  daily: { day: string; orders: number; sales: number }[];
  /** Best dealers this month by sales. */
  topDealers: { name: string; orders: number; sales: number }[];
};

const STATUSES: OrderStatus[] = ['PENDING', 'PREPARING', 'SHIPPED', 'INVOICED', 'PAID', 'CANCELLED'];
const round = (n: number) => Math.round(n * 100) / 100;

/** `YYYY-MM` of the month before `month` (`YYYY-MM`). */
function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Sales figures for the dashboard. `now` is injectable for tests. */
export function summarizeOrders(orders: readonly OrderLike[], now = Date.now(), days = 14): SalesSummary {
  const today = thaiDay(now);
  const month = today.slice(0, 7);
  const lastMonth = previousMonth(month);
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  const dailyKeys = Array.from({ length: days }, (_, i) => thaiDay(now - (days - 1 - i) * 86_400_000));
  const daily = new Map(dailyKeys.map((day) => [day, { day, orders: 0, sales: 0 }]));
  const dealers = new Map<string, { name: string; orders: number; sales: number }>();
  const summary: SalesSummary = { orders: 0, sales: 0, paid: 0, today: { orders: 0, sales: 0 }, month: { orders: 0, sales: 0 }, lastMonth: { orders: 0, sales: 0 }, byStatus, daily: [], topDealers: [] };

  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    if (order.status === 'CANCELLED') continue;
    const day = thaiDay(order.createdAt);
    summary.orders += 1;
    summary.sales += order.total;
    if (order.status === 'PAID') summary.paid += order.total;
    if (day === today) { summary.today.orders += 1; summary.today.sales += order.total; }
    if (day.startsWith(month)) {
      summary.month.orders += 1;
      summary.month.sales += order.total;
      const dealer = dealers.get(order.dealerName) ?? { name: order.dealerName, orders: 0, sales: 0 };
      dealer.orders += 1;
      dealer.sales += order.total;
      dealers.set(order.dealerName, dealer);
    }
    if (day.startsWith(lastMonth)) { summary.lastMonth.orders += 1; summary.lastMonth.sales += order.total; }
    const bucket = daily.get(day);
    if (bucket) { bucket.orders += 1; bucket.sales += order.total; }
  }

  summary.sales = round(summary.sales);
  summary.paid = round(summary.paid);
  summary.today.sales = round(summary.today.sales);
  summary.month.sales = round(summary.month.sales);
  summary.lastMonth.sales = round(summary.lastMonth.sales);
  summary.daily = [...daily.values()].map((d) => ({ ...d, sales: round(d.sales) }));
  summary.topDealers = [...dealers.values()].map((d) => ({ ...d, sales: round(d.sales) })).sort((a, b) => b.sales - a.sales).slice(0, 5);
  return summary;
}

/** Percent change from `before` to `after`; null when there is no base to compare with. */
export function percentChange(after: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((after - before) / before) * 1000) / 10;
}

/** Credit invoices due within this many days are listed as "ใกล้ครบกำหนด". */
export const DUE_SOON_DAYS = 7;
/** Due within this many days (or today) makes the reminder a "today" task instead of a follow-up. */
export const DUE_URGENT_DAYS = 3;
const NOT_OWED = new Set(['paid', 'in_payment', 'reversed']);
const bahtText = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

/** One unpaid Odoo invoice of a credit order, with days until its due date (negative = overdue). */
export type CreditDue = { orderId: string; ref: string; dealerName: string; invoice: string; dueDate: string; residual: number; daysLeft: number };

/** Whole days from Thai day `from` to `to` (both `YYYY-MM-DD`). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "เลยกำหนด 3 วัน" / "ครบกำหนดวันนี้" / "อีก 2 วัน". */
export function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `เลยกำหนด ${-daysLeft} วัน`;
  return daysLeft === 0 ? 'ครบกำหนดวันนี้' : `อีก ${daysLeft} วัน`;
}

/**
 * Unpaid invoices of credit orders that are overdue or due within `withinDays`, soonest first.
 * Due dates come from the Odoo status sync (`odoo.progress.invoices`), so orders not yet invoiced
 * or not yet synced are skipped.
 */
export function creditDues(orders: readonly OrderLike[], now = Date.now(), withinDays = DUE_SOON_DAYS): CreditDue[] {
  const today = thaiDay(now);
  const dues: CreditDue[] = [];
  for (const order of orders) {
    if (order.paymentMethod !== 'CREDIT' || order.status === 'CANCELLED' || order.status === 'PAID') continue;
    for (const inv of order.odoo?.progress?.invoices ?? []) {
      if (!inv.dueDate || inv.amountResidual <= 0 || NOT_OWED.has(inv.paymentState)) continue;
      const dueDate = inv.dueDate.slice(0, 10);
      const daysLeft = daysBetween(today, dueDate);
      if (Number.isNaN(daysLeft) || daysLeft > withinDays) continue;
      dues.push({ orderId: order.id, ref: order.ref, dealerName: order.dealerName, invoice: inv.name, dueDate, residual: inv.amountResidual, daysLeft });
    }
  }
  return dues.sort((a, b) => a.daysLeft - b.daysLeft || b.residual - a.residual);
}

export type TaskPriority = 'urgent' | 'today' | 'soon';

/** One thing someone should do, with where to go to do it. */
export type DashboardTask = {
  id: string;
  priority: TaskPriority;
  title: string;
  detail: string;
  count: number;
  href: string;
  /** Short label for the button. */
  action: string;
  /** Only admins can open the target page. */
  adminOnly?: boolean;
};

export type TaskInput = {
  orders: readonly OrderLike[];
  newLeads: number;
  /** Oldest new lead, ISO time, for "waiting since". */
  oldestNewLeadAt?: string | null;
  pendingDealers: number;
  /** Price books waiting for approval. */
  booksPending: { id: string; label: string }[];
  resetRequests: number;
  /** Delivery methods published on the web; null when Odoo could not be read. */
  publishedCarriers: number | null;
  now?: number;
};

const STALE_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, today: 1, soon: 2 };

/**
 * Builds today's to-do list from what is waiting: slips to check, orders to confirm, Odoo push failures,
 * credit payments dealers reported, sign-ups and dealers to approve, price books to approve, password resets, and setup gaps.
 * Most urgent first; empty when nothing is waiting.
 */
export function buildTasks(input: TaskInput): DashboardTask[] {
  const now = input.now ?? Date.now();
  const pending = input.orders.filter((o) => o.status === 'PENDING');
  const slipToCheck = pending.filter((o) => o.paymentMethod === 'CASH' && o.payment.slipFile && !o.payment.verifiedAt);
  const readyToConfirm = pending.filter((o) => o.paymentMethod === 'CREDIT' || Boolean(o.payment.verifiedAt));
  const waitingSlip = pending.filter((o) => o.paymentMethod === 'CASH' && !o.payment.slipFile);
  const stale = pending.filter((o) => now - new Date(o.createdAt).getTime() > STALE_MS);
  const odooProblems = input.orders.filter((o) => o.status !== 'CANCELLED' && (o.odoo?.status === 'FAILED' || o.odoo?.status === 'MISMATCH'));
  // Transfers dealers reported on credit orders (from the order page) that nobody has checked yet.
  const creditPays = input.orders.filter((o) => o.status !== 'CANCELLED' && pendingCreditPayments(o).length > 0);
  const creditPayStale = creditPays.some((o) => pendingCreditPayments(o).some((p) => now - new Date(p.uploadedAt).getTime() > STALE_MS));
  const creditPayTotal = creditPays.reduce((sum, o) => sum + pendingCreditPayments(o).reduce((s, p) => s + p.amount, 0), 0);
  const tasks: DashboardTask[] = [];
  const refs = (list: readonly OrderLike[]) => list.slice(0, 3).map((o) => o.ref).join(', ') + (list.length > 3 ? ` และอีก ${list.length - 3}` : '');
  const one = (list: readonly OrderLike[], fallback: string) => (list.length === 1 ? `/admin/orders?open=${encodeURIComponent(list[0].id)}` : fallback);

  if (odooProblems.length) tasks.push({
    id: 'odoo-sync', priority: 'urgent', count: odooProblems.length, title: 'ส่งออเดอร์เข้า Odoo ไม่สำเร็จ / ยอดไม่ตรง',
    detail: `${refs(odooProblems)} · ตรวจแล้วกดส่งเข้า Odoo อีกครั้ง`, href: one(odooProblems, '/admin/orders?status=PREPARING'), action: 'แก้ไข',
  });
  if (slipToCheck.length) tasks.push({
    id: 'check-slip', priority: stale.some((o) => slipToCheck.includes(o)) ? 'urgent' : 'today', count: slipToCheck.length, title: 'ตรวจสลิปโอนเงิน',
    detail: `${refs(slipToCheck)} · ตรวจยอดแล้วกด “ตรวจสลิปแล้ว” จึงยืนยันออเดอร์ได้`, href: one(slipToCheck, '/admin/orders?status=PENDING'), action: 'ตรวจสลิป',
  });
  if (readyToConfirm.length) tasks.push({
    id: 'confirm-orders', priority: stale.some((o) => readyToConfirm.includes(o)) ? 'urgent' : 'today', count: readyToConfirm.length, title: 'ยืนยันออเดอร์ (สร้างใบสั่งขายใน Odoo)',
    detail: `${refs(readyToConfirm)} · เครดิตหรือตรวจสลิปแล้ว พร้อมยืนยัน`, href: one(readyToConfirm, '/admin/orders?status=PENDING'), action: 'ยืนยัน',
  });
  if (creditPays.length) tasks.push({
    id: 'credit-payment', priority: creditPayStale ? 'urgent' : 'today', count: creditPays.reduce((n, o) => n + pendingCreditPayments(o).length, 0), title: 'ลูกค้าเครดิตแจ้งโอนชำระ · ตรวจสลิป',
    detail: `${refs(creditPays)} · รวม ${bahtText.format(creditPayTotal)} · ตรวจเงินเข้าแล้วกด “ตรวจแล้ว” และลงรับชำระใน Odoo`, href: one(creditPays, '/admin/orders?pay=pending'), action: 'ตรวจสลิป',
  });
  const dues = creditDues(input.orders, now);
  const overdue = dues.filter((d) => d.daysLeft < 0);
  const dueSoon = dues.filter((d) => d.daysLeft >= 0);
  /** "SO1 ร้าน A (เลยกำหนด 2 วัน), …" for the first three invoices. */
  const dueRefs = (list: CreditDue[]) => list.slice(0, 3).map((d) => `${d.invoice} ${d.dealerName} (${dueLabel(d.daysLeft)})`).join(', ') + (list.length > 3 ? ` และอีก ${list.length - 3}` : '');
  const dueTotal = (list: CreditDue[]) => bahtText.format(list.reduce((sum, d) => sum + d.residual, 0));
  const dueHref = (list: CreditDue[], filter: string) => (new Set(list.map((d) => d.orderId)).size === 1 ? `/admin/orders?open=${encodeURIComponent(list[0].orderId)}` : `/admin/orders?due=${filter}`);
  if (overdue.length) tasks.push({
    id: 'credit-overdue', priority: 'urgent', count: overdue.length, title: 'ลูกค้าเครดิตเลยกำหนดชำระ',
    detail: `${dueRefs(overdue)} · ค้างรวม ${dueTotal(overdue)} · โทรติดตามเก็บเงิน`, href: dueHref(overdue, 'overdue'), action: 'ติดตาม',
  });
  if (dueSoon.length) tasks.push({
    id: 'credit-due-soon', priority: dueSoon.some((d) => d.daysLeft <= DUE_URGENT_DAYS) ? 'today' : 'soon', count: dueSoon.length,
    title: `ใกล้ครบกำหนดชำระ (เครดิต ภายใน ${DUE_SOON_DAYS} วัน)`,
    detail: `${dueRefs(dueSoon)} · รวม ${dueTotal(dueSoon)} · แจ้งเตือนร้านทาง LINE`, href: dueHref(dueSoon, 'soon'), action: 'ดูบิล',
  });
  if (input.newLeads) tasks.push({
    id: 'leads', priority: input.oldestNewLeadAt && now - new Date(input.oldestNewLeadAt).getTime() > DAY_MS ? 'urgent' : 'today', count: input.newLeads,
    title: 'ใบสมัครดีลเลอร์ใหม่', detail: 'โทรหาร้าน แล้วอนุมัติหรือปฏิเสธ', href: '/admin/leads?status=NEW', action: 'ดูใบสมัคร',
  });
  if (input.pendingDealers) tasks.push({
    id: 'dealers', priority: 'today', count: input.pendingDealers, title: 'ดีลเลอร์รออนุมัติ',
    detail: 'ตั้งประเภท/ระดับแล้วเปลี่ยนสถานะเป็นใช้งาน', href: '/admin/dealers?status=PENDING', action: 'อนุมัติร้าน',
  });
  if (input.booksPending.length) tasks.push({
    id: 'price-books', priority: 'today', count: input.booksPending.length, title: 'ตารางราคารออนุมัติ',
    detail: `${input.booksPending.slice(0, 3).map((b) => b.label).join(', ')} · ผู้อนุมัติต้องไม่ใช่ผู้ส่ง`, adminOnly: true,
    href: input.booksPending.length === 1 ? `/admin/prices?book=${encodeURIComponent(input.booksPending[0].id)}` : '/admin/prices', action: 'อนุมัติราคา',
  });
  if (input.resetRequests) tasks.push({
    id: 'reset-requests', priority: 'today', count: input.resetRequests, title: 'คำขอรีเซ็ตรหัสผ่าน',
    detail: 'ยืนยันตัวตนแล้วส่งรหัสชั่วคราวทาง LINE', href: '/admin/users', action: 'รีเซ็ตรหัส', adminOnly: true,
  });
  if (input.publishedCarriers === 0) tasks.push({
    id: 'carriers', priority: 'urgent', count: 0, title: 'ยังไม่มีการจัดส่งที่เปิดบนเว็บ',
    detail: 'ลูกค้าที่ยังไม่กำหนดการจัดส่งจะสั่งซื้อไม่ได้ · เปิดอย่างน้อย 1 วิธี', href: '/admin/delivery?show=all', action: 'ตั้งค่า', adminOnly: true,
  });
  if (waitingSlip.length) tasks.push({
    id: 'waiting-slip', priority: 'soon', count: waitingSlip.length, title: 'รอดีลเลอร์แนบสลิป',
    detail: `${refs(waitingSlip)} · ติดตามร้านทาง LINE ถ้านานเกินไป`, href: one(waitingSlip, '/admin/orders?status=PENDING'), action: 'ดูออเดอร์',
  });
  return tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
