import type { ParsedSize } from './types';

/** Ordered size patterns. First match wins. */
const PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => { label: string; rim: string } }[] = [
  // 195/65R15, 205/55ZR16, 215/70R15C, 70/90-14, 50/100-17
  {
    re: /(\d{2,3})\/(\d{2,3})\s*(ZR|R|-)\s*(\d{2}(?:\.\d)?)(C?)\b/i,
    build: (m) => ({ label: `${m[1]}/${m[2]}${m[3].toUpperCase()}${m[4]}${m[5].toUpperCase()}`, rim: m[4] }),
  },
  // 33x12.50R20
  {
    re: /(\d{2})\s*[xX]\s*(\d{1,2}\.\d{1,2})\s*R\s*(\d{2}(?:\.\d)?)/,
    build: (m) => ({ label: `${m[1]}x${m[2]}R${m[3]}`, rim: m[3] }),
  },
  // 11R22.5, 10.00R20, 9.5R17.5
  {
    re: /\b(\d{1,2}(?:\.\d{1,2})?)\s*(ZR|R)\s*(\d{2}(?:\.\d)?)\b/i,
    build: (m) => ({ label: `${m[1]}${m[2].toUpperCase()}${m[3]}`, rim: m[3] }),
  },
  // 2.75-17, 3.00-18
  {
    re: /\b(\d{1,2}\.\d{2})\s*-\s*(\d{2})\b/,
    build: (m) => ({ label: `${m[1]}-${m[2]}`, rim: m[2] }),
  },
];

/**
 * Extracts a tire size from a free-text product name.
 * Returns null when no known size pattern is present (batteries, wheels, fees).
 */
export function parseSize(name: string): ParsedSize | null {
  for (const { re, build } of PATTERNS) {
    const match = name.match(re);
    if (match) {
      const { label, rim } = build(match);
      return { label, rim, digits: label.replace(/\D/g, '') };
    }
  }
  return null;
}

/**
 * Normalizes a user query for size matching.
 * Returns `{ digits }` when the query is numeric-ish (e.g. `195 65 15`, `1956515`, `195/65/15`),
 * otherwise `{ text }` in uppercase without spaces.
 */
export function normalizeSizeQuery(query: string): { digits: string } | { text: string } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  // Queries that start with a letter (e.g. "R15", "AL30") are label/text searches, not numeric sizes.
  if (/^[A-Za-z]/.test(trimmed)) return { text: trimmed.toUpperCase().replace(/\s+/g, '') };
  const stripped = trimmed.replace(/[\s/\-.xX]/g, '').replace(/ZR|R|C/gi, '');
  if (/^\d+$/.test(stripped) && stripped.length >= 2) return { digits: stripped };
  return { text: trimmed.toUpperCase().replace(/\s+/g, '') };
}

/** True when a parsed size satisfies the user query (digits prefix/substring or label substring). */
export function sizeMatches(size: ParsedSize | null, normalized: { digits: string } | { text: string }): boolean {
  if (!size) return false;
  if ('digits' in normalized) return size.digits.startsWith(normalized.digits) || size.digits.includes(normalized.digits);
  return size.label.toUpperCase().includes(normalized.text);
}
