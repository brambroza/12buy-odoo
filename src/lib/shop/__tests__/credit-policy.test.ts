import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERDUE_GRACE_DAYS, MAX_OVERDUE_GRACE_DAYS, parseGraceDays } from '../credit-policy';

describe('parseGraceDays', () => {
  it('accepts whole days from 0 to the maximum, as number or text', () => {
    expect(parseGraceDays(0)).toBe(0);
    expect(parseGraceDays(10)).toBe(10);
    expect(parseGraceDays(' 7 ')).toBe(7);
    expect(parseGraceDays(MAX_OVERDUE_GRACE_DAYS)).toBe(MAX_OVERDUE_GRACE_DAYS);
  });
  it('falls back for anything else', () => {
    expect(parseGraceDays(-1)).toBe(DEFAULT_OVERDUE_GRACE_DAYS);
    expect(parseGraceDays(MAX_OVERDUE_GRACE_DAYS + 1)).toBe(DEFAULT_OVERDUE_GRACE_DAYS);
    expect(parseGraceDays(2.5)).toBe(DEFAULT_OVERDUE_GRACE_DAYS);
    expect(parseGraceDays('abc')).toBe(DEFAULT_OVERDUE_GRACE_DAYS);
    expect(parseGraceDays(undefined)).toBe(DEFAULT_OVERDUE_GRACE_DAYS);
    expect(parseGraceDays(null, 3)).toBe(3);
  });
});
