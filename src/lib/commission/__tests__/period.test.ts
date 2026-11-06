import { describe, expect, it } from 'vitest';
import { addDays, calendarOf, daysBetween, endDateProblem, isIsoDate, isPeriod, overdueDays, payDate, periodContaining, periodDates, periodLabel, periodOf, periodRange, recentPeriods, shiftPeriod, thaiDay, todayBangkok } from '../period';

describe('commission periods', () => {
  it('runs from the 21st of the previous month to the 20th (client example 20/09–20/10 paid end of Nov)', () => {
    expect(periodRange('2026-10', 20)).toEqual({ start: '2026-09-21', end: '2026-10-20' });
    expect(payDate('2026-10')).toBe('2026-11-30');
  });

  it('crosses the year boundary', () => {
    expect(periodRange('2027-01', 20)).toEqual({ start: '2026-12-21', end: '2027-01-20' });
    expect(payDate('2026-12')).toBe('2027-01-31');
    expect(payDate('2027-01')).toBe('2027-02-28');
    expect(shiftPeriod('2027-01', -1)).toBe('2026-12');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
  });

  it('puts the cut-off day in the period and the day after in the next', () => {
    expect(periodOf('2026-10-20', 20)).toBe('2026-10');
    expect(periodOf('2026-10-21', 20)).toBe('2026-11');
    expect(periodOf('2026-12-25', 20)).toBe('2027-01');
    expect(periodOf('2026-09-21', 20)).toBe('2026-10');
  });

  it('supports other cut-off days', () => {
    expect(periodRange('2026-03', 25)).toEqual({ start: '2026-02-26', end: '2026-03-25' });
  });

  it('counts days overdue from the due date, early payment counts as 0', () => {
    expect(overdueDays('2026-10-08', '2026-10-01')).toBe(7);
    expect(overdueDays('2026-10-01', '2026-10-01')).toBe(0);
    expect(overdueDays('2026-09-25', '2026-10-01')).toBe(0);
    expect(overdueDays('2026-10-01', null)).toBeNull();
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(addDays('2026-10-01', -120)).toBe('2026-06-03');
  });

  it('validates input', () => {
    expect(isPeriod('2026-10')).toBe(true);
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(() => periodRange('bad', 20)).toThrow();
    expect(() => shiftPeriod('bad', 1)).toThrow();
  });

  it('labels and lists periods', () => {
    expect(thaiDay(null)).toBe('—');
    expect(periodLabel('2026-10', 20)).toContain('–');
    expect(todayBangkok(new Date('2026-10-20T18:30:00Z'))).toBe('2026-10-21');
    expect(recentPeriods('2026-10-21', 20, 3)).toEqual(['2026-11', '2026-10', '2026-09']);
  });
});

describe('period calendar', () => {
  const rule = { cutoffDay: 20, payDay: 0, payMonths: 1 };

  it('pays on a set day N months later, capped at the month end', () => {
    expect(payDate('2026-10', 5, 2)).toBe('2026-12-05');
    expect(payDate('2027-01', 31, 1)).toBe('2027-02-28');
    expect(payDate('2026-10', 0, 0)).toBe('2026-10-31');
    expect(periodDates(calendarOf({ cutoffDay: 20, payDay: 15, payMonths: 1 }), '2026-10')).toMatchObject({ start: '2026-09-21', end: '2026-10-20', payDate: '2026-11-15', customPay: false });
  });

  it('moves the next start with a period\'s own end, so periods never overlap or leave a gap', () => {
    const cal = calendarOf(rule, [{ period: '2026-12', endDate: '2026-12-25', payDate: '2027-01-15' }]);
    expect(periodDates(cal, '2026-12')).toMatchObject({ start: '2026-11-21', end: '2026-12-25', payDate: '2027-01-15', customEnd: true, customPay: true, customStart: false });
    expect(periodDates(cal, '2027-01')).toMatchObject({ start: '2026-12-26', end: '2027-01-20', payDate: '2027-02-28', customStart: true, customEnd: false });
    expect(periodLabel('2027-01', cal)).toContain('26 ธ.ค. 69');
  });

  it('finds the period of a date with own period ends', () => {
    const cal = calendarOf(rule, [{ period: '2026-12', endDate: '2026-12-25', payDate: null }]);
    expect(periodContaining(cal, '2026-12-23')).toBe('2026-12');
    expect(periodContaining(cal, '2026-12-26')).toBe('2027-01');
    expect(periodContaining(cal, '2026-11-21')).toBe('2026-12');
    expect(recentPeriods('2026-12-23', cal, 2)).toEqual(['2026-12', '2026-11']);
  });

  it('refuses an end before the start or one that leaves the next period no days', () => {
    const cal = calendarOf(rule);
    expect(endDateProblem(cal, '2026-12', '2026-12-25')).toBeNull();
    expect(endDateProblem(cal, '2026-12', '2026-11-20')).toContain('ไม่ก่อนวันเริ่มรอบ');
    expect(endDateProblem(cal, '2026-12', '2027-01-20')).toContain('รอบถัดไป');
    expect(endDateProblem(cal, '2026-12', 'bad')).toBe('วันสิ้นสุดรอบไม่ถูกต้อง');
  });
});
