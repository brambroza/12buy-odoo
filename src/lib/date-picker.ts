/**
 * Pure calendar helpers behind the shared <DatePicker>.
 * Dates travel as ISO "YYYY-MM-DD" strings (what `<input type="date">` posted before), and all
 * maths runs on UTC midnights so the server's or browser's time zone can never shift a day.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Thai month names, index 0 = January. */
export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'] as const;
/** Short Thai month names, index 0 = January. */
export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const;
/** Weekday headers, Sunday first (Thai wall calendars start on Sunday). */
export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;
/** Full weekday names for screen readers, Sunday first. */
export const THAI_WEEKDAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'] as const;

/** Offset between Christian (ค.ศ.) and Buddhist (พ.ศ.) years. */
export const BUDDHIST_YEAR_OFFSET = 543;

/** A calendar month, `month` is 0-based like Date. */
export type YearMonth = { year: number; month: number };

/**
 * Parse an ISO "YYYY-MM-DD" date into a UTC Date, or null when the text is not a real day
 * (bad format, "2026-02-30", empty, undefined).
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = ISO_RE.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

/** Format a UTC Date as ISO "YYYY-MM-DD". */
export function toIsoDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today in Thailand (Asia/Bangkok) as ISO, regardless of the machine's own zone. */
export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Shift an ISO date by whole days (negative goes back). Returns the input unchanged if it is not a valid date. */
export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/**
 * Shift an ISO date by whole months, clamping the day to the target month's length
 * (31 Jan + 1 month = 28/29 Feb, never 2/3 Mar).
 */
export function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  const target = shiftMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() }, months);
  const day = Math.min(date.getUTCDate(), daysInMonth(target));
  return toIsoDate(new Date(Date.UTC(target.year, target.month, day)));
}

/** Number of days in a month. */
export function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Move a month forward/back by `delta` months, rolling the year as needed. */
export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** The month that contains an ISO date (falls back to `fallback` for invalid input). */
export function monthOf(iso: string | null | undefined, fallback: YearMonth): YearMonth {
  const date = parseIsoDate(iso);
  return date ? { year: date.getUTCFullYear(), month: date.getUTCMonth() } : fallback;
}

/** One cell of the month grid. */
export type DayCell = { iso: string; day: number; inMonth: boolean; weekday: number };

/**
 * Six full weeks (42 cells, Sunday first) covering a month, padded with the trailing days of the
 * previous month and the leading days of the next so the popup never changes height.
 */
export function monthGrid(view: YearMonth): DayCell[] {
  const first = new Date(Date.UTC(view.year, view.month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    cells.push({ iso: toIsoDate(date), day: date.getUTCDate(), inMonth: date.getUTCMonth() === view.month, weekday: date.getUTCDay() });
  }
  return cells;
}

/** True when `iso` is outside the optional inclusive [min, max] bounds. ISO strings compare lexically. */
export function isOutOfRange(iso: string, min?: string | null, max?: string | null): boolean {
  return Boolean((min && parseIsoDate(min) && iso < min) || (max && parseIsoDate(max) && iso > max));
}

/** Pull an ISO date back inside [min, max]. */
export function clampIso(iso: string, min?: string | null, max?: string | null): string {
  if (min && parseIsoDate(min) && iso < min) return min;
  if (max && parseIsoDate(max) && iso > max) return max;
  return iso;
}

/** "20 พ.ย. 2569" — short Thai date with Buddhist year, or "" for an invalid date. */
export function formatThaiDate(iso: string | null | undefined): string {
  const date = parseIsoDate(iso);
  if (!date) return '';
  return `${date.getUTCDate()} ${THAI_MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear() + BUDDHIST_YEAR_OFFSET}`;
}

/** "วันศุกร์ที่ 20 พฤศจิกายน 2569" — long Thai date for screen readers, or "" for an invalid date. */
export function formatThaiDateLong(iso: string | null | undefined): string {
  const date = parseIsoDate(iso);
  if (!date) return '';
  return `${THAI_WEEKDAYS[date.getUTCDay()]}ที่ ${date.getUTCDate()} ${THAI_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear() + BUDDHIST_YEAR_OFFSET}`;
}

/** "พฤศจิกายน 2569" caption for a month. */
export function formatThaiMonth({ year, month }: YearMonth): string {
  return `${THAI_MONTHS[month]} ${year + BUDDHIST_YEAR_OFFSET}`;
}
