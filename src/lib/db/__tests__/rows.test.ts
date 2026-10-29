import { describe, expect, it } from 'vitest';
import { DbError, escapeLike, isUniqueViolation, parseTimestamp, quoteFilterValue, reviveDates, toRow, unwrap } from '@/lib/db/rows';

describe('parseTimestamp', () => {
  it('reads offset-less timestamps as UTC', () => {
    expect(parseTimestamp('2026-10-28T06:00:00.123').toISOString()).toBe('2026-10-28T06:00:00.123Z');
  });

  it('keeps explicit offsets', () => {
    expect(parseTimestamp('2026-10-28T13:00:00+07:00').toISOString()).toBe('2026-10-28T06:00:00.000Z');
    expect(parseTimestamp('2026-10-28T06:00:00Z').toISOString()).toBe('2026-10-28T06:00:00.000Z');
  });
});

describe('reviveDates', () => {
  it('converts …At fields recursively and leaves the rest alone', () => {
    const row = reviveDates<{ createdAt: Date; name: string; lastLoginAt: null; dealer: { approvedAt: Date }; users: { createdAt: Date }[] }>({
      createdAt: '2026-10-28T06:00:00', name: 'At home', lastLoginAt: null, dealer: { approvedAt: '2026-10-01T00:00:00' }, users: [{ createdAt: '2026-10-02T00:00:00' }],
    });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.name).toBe('At home');
    expect(row.lastLoginAt).toBeNull();
    expect(row.dealer.approvedAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(row.users[0].createdAt).toBeInstanceOf(Date);
  });
});

describe('toRow', () => {
  it('serializes Dates and drops undefined', () => {
    expect(toRow({ a: new Date('2026-10-28T06:00:00Z'), b: undefined, c: null, d: 1 })).toEqual({ a: '2026-10-28T06:00:00.000Z', c: null, d: 1 });
  });
});

describe('unwrap / isUniqueViolation', () => {
  it('returns data or throws a DbError carrying the SQLSTATE', () => {
    expect(unwrap({ data: [1], error: null })).toEqual([1]);
    try {
      unwrap({ data: null, error: { message: 'duplicate key', code: '23505' } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DbError);
      expect(isUniqueViolation(error)).toBe(true);
    }
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});

describe('filter escaping', () => {
  it('quotes or-filter values so commas and parentheses stay literal', () => {
    expect(quoteFilterValue('%a,b)%')).toBe('"%a,b)%"');
    expect(quoteFilterValue('say "hi"\\')).toBe('"say \\"hi\\"\\\\"');
  });

  it('escapes like wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
