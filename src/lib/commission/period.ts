/**
 * Commission periods. A period is named by the month it ends in: with cut-off day 20,
 * `2026-10` runs from 21 Sep 2026 to 20 Oct 2026 and is paid on the last day of November.
 * A company sets the cut-off day and the pay rule; one period may override its end and pay date
 * (see `PeriodCalendar`). All dates are `YYYY-MM-DD` strings handled in UTC so no time zone can shift a day.
 */

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** True for `YYYY-MM`. */
export function isPeriod(value: string | null | undefined): value is string {
  return typeof value === 'string' && PERIOD_RE.test(value);
}

/** True for `YYYY-MM-DD` that is a real calendar date. */
export function isIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day));

/** Shifts a period by `months` (negative = earlier). */
export function shiftPeriod(period: string, months: number): string {
  const [, y, m] = PERIOD_RE.exec(period) ?? [];
  if (!y) throw new Error(`Invalid period ${period}`);
  const d = utc(Number(y), Number(m) - 1 + months, 1);
  return iso(d).slice(0, 7);
}

/** First and last day (inclusive) of a period for the given cut-off day (1–28). */
export function periodRange(period: string, cutoffDay: number): { start: string; end: string } {
  const [, y, m] = PERIOD_RE.exec(period) ?? [];
  if (!y) throw new Error(`Invalid period ${period}`);
  const end = utc(Number(y), Number(m) - 1, cutoffDay);
  const start = utc(Number(y), Number(m) - 2, cutoffDay + 1);
  return { start: iso(start), end: iso(end) };
}

/** Period a date falls in: after the cut-off day it belongs to the next month's period. */
export function periodOf(date: string, cutoffDay: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = d > cutoffDay ? utc(y, m, 1) : utc(y, m - 1, 1);
  return iso(month).slice(0, 7);
}

/**
 * Default pay day: day `payDay` (0 = last day; capped at the month's last day) of the month
 * `payMonths` after the period's month. Defaults: last day of the next month (2026-10 → 2026-11-30).
 */
export function payDate(period: string, payDay = 0, payMonths = 1): string {
  const [y, m] = period.split('-').map(Number);
  const last = utc(y, m + payMonths, 0);
  return payDay > 0 && payDay < last.getUTCDate() ? iso(utc(y, m - 1 + payMonths, payDay)) : iso(last);
}

/** "สิ้นเดือน เดือนถัดไป", "วันที่ 5 ถัดไป 2 เดือน", ... */
export function payRuleText(payDay: number, payMonths: number): string {
  const day = payDay > 0 ? `วันที่ ${payDay}` : 'สิ้นเดือน';
  return payMonths === 0 ? `${day} ของเดือนสิ้นรอบ` : payMonths === 1 ? `${day} เดือนถัดไป` : `${day} ถัดไป ${payMonths} เดือน`;
}

/** A company's period rule: cut-off day (1–28) and the default pay day. */
export type PeriodRule = { cutoffDay: number; payDay: number; payMonths: number };
/** One period's own end date and/or pay date (null = follow the rule). */
export type PeriodOverride = { period: string; endDate: string | null; payDate: string | null; note?: string | null; updatedAt?: string | Date | null };
/** Everything needed to work out any period's dates. Plain data, safe to pass around. */
export type PeriodCalendar = { rule: PeriodRule; overrides: readonly PeriodOverride[] };
export type PeriodDates = { start: string; end: string; payDate: string; customStart: boolean; customEnd: boolean; customPay: boolean; note: string | null };

export function calendarOf(source: { cutoffDay: number; payDay?: number | null; payMonths?: number | null } | null | undefined, overrides: readonly PeriodOverride[] = []): PeriodCalendar {
  return { rule: { cutoffDay: source?.cutoffDay ?? 20, payDay: source?.payDay ?? 0, payMonths: source?.payMonths ?? 1 }, overrides };
}

const overrideOf = (cal: PeriodCalendar, period: string) => cal.overrides.find((o) => o.period === period);
const endOf = (cal: PeriodCalendar, period: string) => overrideOf(cal, period)?.endDate ?? periodRange(period, cal.rule.cutoffDay).end;

/**
 * Dates of a period. The start always follows the previous period's end, so periods never
 * overlap or leave a gap: moving one period's end also moves the next one's start.
 */
export function periodDates(cal: PeriodCalendar, period: string): PeriodDates {
  const own = overrideOf(cal, period);
  const previous = shiftPeriod(period, -1);
  return {
    start: addDays(endOf(cal, previous), 1),
    end: endOf(cal, period),
    payDate: own?.payDate ?? payDate(period, cal.rule.payDay, cal.rule.payMonths),
    customStart: Boolean(overrideOf(cal, previous)?.endDate),
    customEnd: Boolean(own?.endDate),
    customPay: Boolean(own?.payDate),
    note: own?.note ?? null,
  };
}

/** Period a date falls in, with the calendar's own period ends. */
export function periodContaining(cal: PeriodCalendar, date: string): string {
  let period = periodOf(date, cal.rule.cutoffDay);
  for (let i = 0; i < 3 && date < periodDates(cal, period).start; i++) period = shiftPeriod(period, -1);
  for (let i = 0; i < 3 && date > periodDates(cal, period).end; i++) period = shiftPeriod(period, 1);
  return period;
}

/**
 * Checks a new end date for `period`: it must not be before the period starts, and must leave the
 * next period at least one day. Returns the problem in Thai, or null when fine.
 */
export function endDateProblem(cal: PeriodCalendar, period: string, endDate: string): string | null {
  if (!isIsoDate(endDate)) return 'วันสิ้นสุดรอบไม่ถูกต้อง';
  const { start } = periodDates(cal, period);
  if (endDate < start) return `วันสิ้นสุดต้องไม่ก่อนวันเริ่มรอบ (${thaiDay(start)})`;
  const nextEnd = endOf(cal, shiftPeriod(period, 1));
  if (endDate >= nextEnd) return `วันสิ้นสุดต้องก่อน ${thaiDay(nextEnd)} (วันสิ้นสุดของรอบถัดไป)`;
  return null;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Days paid after the due date; paying on or before it counts as 0. Null when there is no due date. */
export function overdueDays(cashDate: string, dueDate: string | null): number | null {
  if (!dueDate) return null;
  return Math.max(0, daysBetween(dueDate, cashDate));
}

/** Adds days to a date. */
export function addDays(date: string, days: number): string {
  return iso(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS));
}

/** Today in Bangkok as `YYYY-MM-DD`. */
export function todayBangkok(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

const monthFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', month: 'short', year: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit' });

/** Thai date such as "20 ต.ค. 69". */
export function thaiDay(date: string | null | undefined): string {
  return date && isIsoDate(date) ? dayFmt.format(new Date(`${date}T00:00:00Z`)) : '—';
}

/** "ต.ค. 69 (21 ก.ย. 69 – 20 ต.ค. 69)", from a cut-off day or a calendar (own period ends included). */
export function periodLabel(period: string, cutoff: number | PeriodCalendar): string {
  const { start, end } = typeof cutoff === 'number' ? periodRange(period, cutoff) : periodDates(cutoff, period);
  return `${monthName(period)} (${thaiDay(start)} – ${thaiDay(end)})`;
}

/** "ต.ค. 69". */
export function monthName(period: string): string {
  return monthFmt.format(new Date(`${period}-01T00:00:00Z`));
}

/** The last `count` periods ending with the one that contains `today`, newest first. */
export function recentPeriods(today: string, cutoff: number | PeriodCalendar, count = 12): string[] {
  const current = typeof cutoff === 'number' ? periodOf(today, cutoff) : periodContaining(cutoff, today);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, -i));
}
