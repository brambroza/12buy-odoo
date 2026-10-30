/**
 * Thai tax id (เลขประจำตัวผู้เสียภาษี): 13 digits for both juristic persons (DBD registration
 * number) and individuals (national id). It is the one identifier a shop cannot change, so it is
 * the key for "is this shop already a dealer / applicant / Odoo customer".
 */

/** Digits of a Thai tax id (13), or null when it is not one. Odoo may store it with `TH`, dashes or spaces. */
export function normalizeTaxId(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length === 13 ? digits : null;
}

/**
 * Mod-11 check digit shared by Thai national ids and juristic registration numbers:
 * sum of the first 12 digits weighted 13..2, check = (11 - sum mod 11) mod 10.
 */
export function isValidThaiTaxId(taxId: string): boolean {
  if (!/^\d{13}$/.test(taxId)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(taxId[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(taxId[12]);
}

/** `0105556123456` → `0-1055-56123-45-6` (the printed form on tax documents). */
export function formatTaxId(taxId: string | null | undefined): string {
  const digits = normalizeTaxId(taxId);
  return digits ? digits.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, '$1-$2-$3-$4-$5') : (taxId ?? '');
}

/** Validation message for a typed tax id, or null when it is a well-formed Thai tax id. */
export function taxIdProblem(raw: string): string | null {
  const digits = normalizeTaxId(raw);
  if (!digits) return 'เลขผู้เสียภาษีต้องมี 13 หลัก';
  if (!isValidThaiTaxId(digits)) return 'เลขผู้เสียภาษีไม่ถูกต้อง ตรวจสอบตัวเลขอีกครั้ง';
  return null;
}
