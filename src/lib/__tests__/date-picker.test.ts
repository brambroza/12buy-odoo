import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  formatThaiDate,
  formatThaiDateLong,
  formatThaiMonth,
  isOutOfRange,
  monthGrid,
  monthOf,
  parseIsoDate,
  shiftMonth,
  todayIso,
} from '@/lib/date-picker';

describe('parseIsoDate', () => {
  it('parses real days', () => {
    expect(parseIsoDate('2026-11-20')?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });
  it('rejects bad input', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('20/11/2026')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
  });
  it('accepts leap day only in leap years', () => {
    expect(parseIsoDate('2028-02-29')).not.toBeNull();
    expect(parseIsoDate('2026-02-29')).toBeNull();
  });
});

describe('date maths', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('nope', 3)).toBe('nope');
  });
  it('adds months and clamps the day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-20', -12)).toBe('2025-11-20');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('bad', 1)).toBe('bad');
  });
  it('shifts months with year roll', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 5 }, 24)).toEqual({ year: 2028, month: 5 });
  });
  it('knows month lengths', () => {
    expect(daysInMonth({ year: 2026, month: 1 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 1 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 10 })).toBe(30);
  });
  it('finds the month of a date, with fallback', () => {
    expect(monthOf('2026-11-20', { year: 2000, month: 0 })).toEqual({ year: 2026, month: 10 });
    expect(monthOf('', { year: 2000, month: 3 })).toEqual({ year: 2000, month: 3 });
  });
});

describe('monthGrid', () => {
  const grid = monthGrid({ year: 2026, month: 10 }); // November 2026 starts on a Sunday
  it('always has 42 cells starting on Sunday', () => {
    expect(grid).toHaveLength(42);
    expect(grid[0].weekday).toBe(0);
    expect(monthGrid({ year: 2026, month: 1 })[0].weekday).toBe(0);
  });
  it('marks in-month days', () => {
    expect(grid[0]).toMatchObject({ iso: '2026-11-01', day: 1, inMonth: true });
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid[41]).toMatchObject({ iso: '2026-12-12', inMonth: false });
  });
  it('pads with the previous month', () => {
    const feb = monthGrid({ year: 2026, month: 1 }); // 1 Feb 2026 is a Sunday too
    const march = monthGrid({ year: 2026, month: 2 }); // 1 Mar 2026 is a Sunday
    expect(feb[0].iso).toBe('2026-02-01');
    expect(march[0].iso).toBe('2026-03-01');
    const dec = monthGrid({ year: 2026, month: 11 }); // 1 Dec 2026 is a Tuesday
    expect(dec[0]).toMatchObject({ iso: '2026-11-29', inMonth: false });
  });
});

describe('range', () => {
  it('detects and clamps out-of-range days', () => {
    expect(isOutOfRange('2026-01-01', '2026-02-01')).toBe(true);
    expect(isOutOfRange('2026-03-01', undefined, '2026-02-01')).toBe(true);
    expect(isOutOfRange('2026-02-01', '2026-02-01', '2026-02-01')).toBe(false);
    expect(isOutOfRange('2026-02-01', 'bad', null)).toBe(false);
    expect(clampIso('2026-01-01', '2026-02-01')).toBe('2026-02-01');
    expect(clampIso('2026-05-01', null, '2026-02-01')).toBe('2026-02-01');
    expect(clampIso('2026-02-10', '2026-02-01', '2026-02-28')).toBe('2026-02-10');
  });
});

describe('Thai formatting', () => {
  it('uses Buddhist years', () => {
    expect(formatThaiDate('2026-11-20')).toBe('20 พ.ย. 2569');
    expect(formatThaiDateLong('2026-11-20')).toBe('วันศุกร์ที่ 20 พฤศจิกายน 2569');
    expect(formatThaiMonth({ year: 2026, month: 0 })).toBe('มกราคม 2569');
  });
  it('returns empty text for invalid dates', () => {
    expect(formatThaiDate('')).toBe('');
    expect(formatThaiDateLong(null)).toBe('');
  });
  it('computes today in Bangkok time', () => {
    // 2026-11-20 18:30 UTC is already 21 Nov in Bangkok (UTC+7).
    expect(todayIso(new Date('2026-11-20T18:30:00Z'))).toBe('2026-11-21');
    expect(todayIso(new Date('2026-11-20T16:59:00Z'))).toBe('2026-11-20');
  });
});
