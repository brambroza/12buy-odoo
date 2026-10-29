/**
 * Helpers shared by the back-office list pages: free-text search, pagination and list URLs
 * that keep the current filters. Pure functions so they are easy to test.
 */

/** Rows per page on every admin list. */
export const PAGE_SIZE = 20;

/** Normalised search text from `?q=`: trimmed, lower-cased, at most 80 characters. */
export function searchText(q: string | undefined): string {
  return (q ?? '').trim().slice(0, 80).toLowerCase();
}

/** True when `q` is empty or any of the given fields contains it (case-insensitive). */
export function matchesSearch(q: string, ...fields: (string | number | null | undefined | false)[]): boolean {
  if (!q) return true;
  return fields.some((field) => field !== null && field !== undefined && field !== false && String(field).toLowerCase().includes(q));
}

export type Page<T> = { items: T[]; page: number; pageCount: number; total: number; from: number; to: number };

/** One page of `items`. `page` comes from `?page=` and is clamped to the valid range (1 when invalid). */
export function paginate<T>(items: readonly T[], page: string | number | undefined, size = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const requested = Math.floor(Number(page));
  const current = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: current, pageCount, total, from: total ? start + 1 : 0, to: start + slice.length };
}

/**
 * Builds `path?query` from the current params plus `changes`. A change of `undefined` or '' drops the key.
 * Only string values are kept, so arrays or objects in `params` are ignored.
 */
export function listHref(path: string, params: Record<string, unknown>, changes: Record<string, string | number | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === 'string' && value) query.set(key, value);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') query.delete(key);
    else query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** Page numbers to show around `page` (with `null` as a gap), e.g. 1 … 4 5 6 … 12. */
export function pageWindow(page: number, pageCount: number, radius = 1): (number | null)[] {
  const pages: (number | null)[] = [];
  for (let n = 1; n <= pageCount; n++) {
    if (n === 1 || n === pageCount || Math.abs(n - page) <= radius) pages.push(n);
    else if (pages[pages.length - 1] !== null) pages.push(null);
  }
  return pages;
}
