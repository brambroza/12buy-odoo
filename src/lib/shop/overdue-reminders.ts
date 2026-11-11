/**
 * Daily overdue reminders for credit dealers (run by the cron route after the Odoo status sync).
 * For every active dealer with credit terms, the credit summary is read (Odoo open invoices, or the web
 * orders when Odoo is down) and, on milestone days, the shop is told in its inbox + LINE:
 * first day past due, 3 days before the lock, 1 day before the lock, and the day credit locks.
 * Staff get one summary card in the LINE group listing every shop in grace or locked.
 * A reminder of the same kind is sent at most once per Thai day per dealer, so a re-run is harmless.
 */
import { thaiDay } from '@/lib/admin/dashboard';
import { listDealers } from '@/lib/dealers/repo';
import { logger } from '@/lib/logger';
import { formatAmount } from '@/lib/money';
import { notifyDealer, notifyStaffGroup } from '@/lib/notify';
import { listNotifications } from '@/lib/notify/repo';
import { addDays, daysBetween, overdueGraceMessage, overdueLockMessage, thaiDate, type OverdueSummary } from './credit';
import { getCreditSummary } from './credit-line';

const log = logger('overdue-reminders');

export type ReminderKind = 'grace-start' | 'grace-3d' | 'grace-1d' | 'locked';

/**
 * Which reminder, if any, a dealer gets `today` for this overdue position:
 * - `locked`: the first day credit is locked (oldest locked invoice's due date + grace days + 1 = today)
 * - `grace-start`: the first day past due of the oldest invoice in grace
 * - `grace-3d` / `grace-1d`: 3 or 1 days before the lock date
 * Null on every other day, and while already locked for more than a day.
 */
export function reminderKind(overdue: OverdueSummary | null, today: string): ReminderKind | null {
  if (!overdue) return null;
  if (overdue.count > 0) {
    return overdue.oldestDueDate && addDays(overdue.oldestDueDate, overdue.graceDays + 1) === today ? 'locked' : null;
  }
  if (!overdue.grace || overdue.grace.count === 0) return null;
  const daysToLock = daysBetween(today, overdue.grace.lockDate);
  if (daysToLock === overdue.graceDays) return 'grace-start';
  if (daysToLock === 3) return 'grace-3d';
  if (daysToLock === 1) return 'grace-1d';
  return null;
}

/** Inbox title + body for one reminder kind. */
export function reminderText(kind: ReminderKind, overdue: OverdueSummary): { title: string; body: string } {
  if (kind === 'locked') return { title: 'ปิดการสั่งซื้อแบบเครดิตชั่วคราว', body: `${overdueLockMessage(overdue)} · เมื่อบัญชีลงรับชำระแล้ว ระบบจะเปิดให้สั่งเครดิตอัตโนมัติ` };
  const title = kind === 'grace-start' ? 'ใบแจ้งหนี้เลยกำหนดชำระ' : kind === 'grace-3d' ? 'อีก 3 วัน ระบบจะปิดสั่งเครดิต' : 'พรุ่งนี้ระบบจะปิดสั่งเครดิต';
  return { title, body: overdueGraceMessage(overdue) };
}

export type ReminderRun = { dealers: number; inGrace: number; locked: number; notified: number; failed: number };

/** True when the dealer already has a reminder of this kind dated `today` (Thai day). */
async function alreadySent(dealerId: string, kind: ReminderKind, today: string): Promise<boolean> {
  const recent = await listNotifications({ dealerId }, 30);
  return recent.some((n) => n.type === `credit.${kind}` && thaiDay(n.createdAt) === today);
}

/**
 * Reads every active credit dealer, sends the milestone reminder due today, and posts one summary to the
 * staff group when any shop is in grace or locked. Never throws: a failing dealer is counted in `failed`.
 */
export async function runOverdueReminders(now = Date.now()): Promise<ReminderRun> {
  const today = thaiDay(now);
  const dealers = (await listDealers({ status: 'ACTIVE' })).filter((d) => d.creditEnabled);
  const run: ReminderRun = { dealers: dealers.length, inGrace: 0, locked: 0, notified: 0, failed: 0 };
  const staffRows: { label: string; value: string }[] = [];
  for (const dealer of dealers) {
    try {
      const { overdue } = await getCreditSummary({ credit: true, dealerId: dealer.id, odooPartnerId: dealer.odooPartnerId });
      if (!overdue) continue;
      if (overdue.count > 0) {
        run.locked += 1;
        staffRows.push({ label: dealer.name, value: `ล็อกแล้ว · ค้าง ${formatAmount(overdue.amount)} บาท` });
      } else if (overdue.grace && overdue.grace.count > 0) {
        run.inGrace += 1;
        staffRows.push({ label: dealer.name, value: `ผ่อนผัน ถึง ${thaiDate(addDays(overdue.grace.lockDate, -1))} · ค้าง ${formatAmount(overdue.grace.amount)} บาท` });
      }
      const kind = reminderKind(overdue, today);
      if (!kind || await alreadySent(dealer.id, kind, today)) continue;
      const text = reminderText(kind, overdue);
      const rows = kind === 'locked'
        ? [{ label: 'ยอดเลยกำหนด', value: `${formatAmount(overdue.amount)} บาท (${overdue.count} ใบ)` }]
        : [{ label: 'ยอดเลยกำหนด', value: `${formatAmount(overdue.grace!.amount)} บาท (${overdue.grace!.count} ใบ)` }, { label: 'ปิดเครดิตตั้งแต่', value: thaiDate(overdue.grace!.lockDate) }];
      await notifyDealer({ dealerId: dealer.id, type: `credit.${kind}`, title: text.title, body: text.body, href: '/shop/account' }, { rows, buttonLabel: 'ดูใบแจ้งหนี้' });
      run.notified += 1;
    } catch (error) {
      run.failed += 1;
      log.error('reminder failed', { dealerId: dealer.id, error });
    }
  }
  if (staffRows.length) {
    await notifyStaffGroup({
      title: 'ลูกค้าเครดิตค้างชำระ (สรุปประจำวัน)',
      body: `ล็อกเครดิตแล้ว ${run.locked} ร้าน · อยู่ในช่วงผ่อนผัน ${run.inGrace} ร้าน · โทรติดตามและลงรับชำระใน Odoo เพื่อปลดล็อก`,
      rows: staffRows.slice(0, 8).concat(staffRows.length > 8 ? [{ label: 'และอีก', value: `${staffRows.length - 8} ร้าน` }] : []),
      href: '/admin/orders?due=overdue',
    });
  }
  log.info('run finished', run);
  return run;
}
