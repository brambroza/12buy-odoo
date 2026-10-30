/**
 * Money text helpers shared by the money input and plain-text notes: thousands separators while
 * typing ("1234567.5" -> "1,234,567.5") and back to a plain number for forms and server parsers.
 */

/** Largest amount the money input accepts; fits NUMERIC(14,2). */
const MAX_INTEGER_DIGITS = 12;

/**
 * Formats what the user typed with thousands commas. Keeps a trailing "." and up to `decimals`
 * decimals so typing "1,000." or "1,000.5" is not undone; drops anything that is not a digit.
 */
export function formatMoneyText(text: string, decimals = 2): string {
  const cleaned = text.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS);
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (dot === -1 || decimals === 0) return grouped;
  const fraction = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, decimals);
  return `${grouped || '0'}.${fraction}`;
}

/** Plain digits for a form field ("1,234.50" -> "1234.50"); blank stays blank, a trailing "." is dropped. */
export function plainMoneyText(text: string): string {
  return text.replace(/,/g, '').replace(/\.$/, '');
}

/** Number from typed money text; null when blank or not a number. */
export function parseMoneyText(text: string): number | null {
  const plain = plainMoneyText(text).trim();
  if (!plain) return null;
  const value = Number(plain);
  return Number.isFinite(value) ? value : null;
}

/** Starting text for a money input from a stored amount (number or NUMERIC string); null/blank = empty. */
export function moneyTextFrom(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
  return formatMoneyText(fixed, decimals);
}

/**
 * Caret position after reformatting: the spot right after the same number of digits (and dot)
 * that were left of the caret before, so commas appearing or disappearing do not move it.
 */
export function caretAfterFormat(formatted: string, significantBefore: number): number {
  if (significantBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ',') seen++;
    if (seen === significantBefore) return i + 1;
  }
  return formatted.length;
}

/** Digits and dot left of `caret` in raw input text (commas ignored). */
export function significantBeforeCaret(text: string, caret: number): number {
  return text.slice(0, caret).replace(/[^\d.]/g, '').length;
}

/** Amount with thousands commas and two decimals for plain-text notes ("1,234.50"), no currency sign. */
export function formatAmount(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
