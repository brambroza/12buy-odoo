/**
 * Targets pasted from Excel: one rep per line, the rep's Odoo user id or name, then the amount,
 * separated by a tab (Excel copy), comma or semicolon. A header line without a number is skipped.
 */
import type { CommissionRep } from './types';

export function parseTargetLines(text: string, reps: readonly Pick<CommissionRep, 'odooUserId' | 'name'>[]): { values: Map<number, number>; errors: string[] } {
  const byId = new Map(reps.map((r) => [String(r.odooUserId), r]));
  const byName = new Map(reps.map((r) => [r.name.trim().toLowerCase(), r]));
  const values = new Map<number, number>();
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    // Tab (Excel) or semicolon split every column; otherwise only the first comma, so "50,000" stays whole.
    const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : null;
    const comma = line.indexOf(',');
    const columns = separator ? line.split(separator) : comma > 0 ? [line.slice(0, comma), line.slice(comma + 1)] : [line];
    const parts = columns.map((p) => p.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`บรรทัด ${index + 1}: ต้องมีชื่อและยอด`);
      return;
    }
    const amountText = parts[parts.length - 1].replace(/,/g, '');
    const key = parts.slice(0, -1).join(' ').trim();
    const amount = Number(amountText);
    if (!amountText || !Number.isFinite(amount)) {
      if (index === 0) return; // header
      errors.push(`บรรทัด ${index + 1}: ยอด "${parts[parts.length - 1]}" ไม่ใช่ตัวเลข`);
      return;
    }
    if (amount < 0) {
      errors.push(`บรรทัด ${index + 1}: ยอดติดลบ`);
      return;
    }
    const rep = byId.get(key) ?? byName.get(key.toLowerCase());
    if (!rep) {
      errors.push(`บรรทัด ${index + 1}: ไม่พบพนักงานขาย "${key}"`);
      return;
    }
    values.set(rep.odooUserId, Math.round(amount * 100) / 100);
  });
  return { values, errors };
}
