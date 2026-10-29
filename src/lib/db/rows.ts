import { randomUUID } from 'node:crypto';

/** Error raised for a failed Supabase/PostgREST call; `code` is the Postgres SQLSTATE (e.g. `23505`). */
export class DbError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly details?: string | null) {
    super(message);
    this.name = 'DbError';
  }
}

/** True when the error is a unique-constraint violation (duplicate email, partner id, ...). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DbError && error.code === '23505';
}

/** New primary key. Old rows keep their Prisma cuids; ids are opaque text either way. */
export function newId(): string {
  return randomUUID();
}

/**
 * Columns are `timestamp(3)` without time zone holding UTC, so PostgREST returns
 * `2026-10-28T06:00:00.123` with no offset. Parse those as UTC, not local time.
 */
export function parseTimestamp(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

/** Turns every `…At` string field (recursively, including embedded rows) into a Date. */
export function reviveDates<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => reviveDates(v)) as T;
  if (!value || typeof value !== 'object' || value instanceof Date) return value as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = key.endsWith('At') && typeof v === 'string' ? parseTimestamp(v) : reviveDates(v);
  }
  return out as T;
}

/** Prepares a write payload: Dates → ISO strings, `undefined` keys dropped. */
export function toRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[key] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

type Result<T> = { data: T | null; error: { message: string; code?: string; details?: string | null } | null };

/** Returns `data` or throws a DbError. */
export function unwrap<T>(result: Result<T>): T {
  if (result.error) throw new DbError(result.error.message, result.error.code, result.error.details);
  return result.data as T;
}

/** Like `unwrap` but revives timestamps; for single rows that may be missing (`maybeSingle`). */
export function rowOrNull<T>(result: Result<unknown>): T | null {
  const data = unwrap(result);
  return data ? reviveDates<T>(data) : null;
}

/** Revives a list result. */
export function rows<T>(result: Result<unknown[]>): T[] {
  return reviveDates<T[]>(unwrap(result) ?? []);
}

/** Quotes a value for a PostgREST `or=(...)` filter so commas/parentheses in user input cannot change the filter. */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escapes `%`, `_` and `\` so user text is matched literally inside an ilike pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
