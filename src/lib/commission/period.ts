/**
 * Commission periods. A period is named by the month it ends in: with cut-off day 20,
 * `2026-10` runs from 21 Sep 2026 to 20 Oct 2026 and is paid on the last day of November.
 * All dates are `YYYY-MM-DD` strings handled in UTC so no time zone can shift a day.
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

/** Pay day: last day of the month after the period's month (2026-10 → 2026-11-30). */
export function payDate(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return iso(utc(y, m + 1, 0));
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

/** "ต.ค. 69 (21 ก.ย. 69 – 20 ต.ค. 69)". */
export function periodLabel(period: string, cutoffDay: number): string {
  const { start, end } = periodRange(period, cutoffDay);
  return `${monthFmt.format(new Date(`${period}-01T00:00:00Z`))} (${thaiDay(start)} – ${thaiDay(end)})`;
}

/** The last `count` periods ending with the one that contains `today`, newest first. */
export function recentPeriods(today: string, cutoffDay: number, count = 12): string[] {
  const current = periodOf(today, cutoffDay);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, -i));
}
