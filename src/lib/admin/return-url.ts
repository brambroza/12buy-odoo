/**
 * Where a back-office server action should send the admin afterwards: the page the form was posted from
 * (taken from the Referer header), so the open drawer, search, filter and page survive, with one-off
 * flags (`error`, `info`, `saved`, …) replaced by `changes`. Only same-site paths under `prefix` are
 * accepted; anything else falls back to `prefix`, which also blocks open redirects.
 */
export function returnUrl(referer: string | null | undefined, prefix: string, changes: Record<string, string | undefined> = {}): string {
  let url: URL;
  try {
    url = new URL(referer ?? '', 'http://local.invalid');
  } catch {
    url = new URL(prefix, 'http://local.invalid');
  }
  // Absolute referers keep only their path; the host is never used, so another origin cannot be targeted.
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) url = new URL(prefix, 'http://local.invalid');
  for (const flag of ['error', 'info', 'saved', 'unknown', 'imported', 'submitted', 'published', 'rejected', 'dryrun', 'fromLead']) url.searchParams.delete(flag);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}
