/** Only same-origin absolute paths are allowed as a post-login destination; anything else falls back to `/shop`. */
export function safeNext(raw: string | null | undefined, fallback = '/shop'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\r\n]/.test(raw)) return fallback;
  return raw;
}
