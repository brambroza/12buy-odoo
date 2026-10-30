import { describe, expect, it } from 'vitest';
import { formatTaxId, isValidThaiTaxId, normalizeTaxId, taxIdProblem } from '@/lib/tax-id';

const VALID = '0105556123453';

describe('tax id', () => {
  it('normalises to 13 digits and drops TH, dashes and spaces', () => {
    expect(normalizeTaxId('TH0105556123453')).toBe(VALID);
    expect(normalizeTaxId('0-1055-56123-45-3')).toBe(VALID);
    expect(normalizeTaxId(' 0105556123453 ')).toBe(VALID);
    expect(normalizeTaxId('010555612345')).toBeNull();
    expect(normalizeTaxId('')).toBeNull();
    expect(normalizeTaxId(null)).toBeNull();
  });

  it('verifies the mod-11 check digit', () => {
    expect(isValidThaiTaxId(VALID)).toBe(true);
    expect(isValidThaiTaxId('1234567890121')).toBe(true);
    expect(isValidThaiTaxId('0105556123456')).toBe(false);
    expect(isValidThaiTaxId('0000000000001')).toBe(true);
    expect(isValidThaiTaxId('12345')).toBe(false);
    expect(isValidThaiTaxId('0-1055-56123-45-3')).toBe(false);
  });

  it('formats as printed on tax documents', () => {
    expect(formatTaxId(VALID)).toBe('0-1055-56123-45-3');
    expect(formatTaxId('TH0105556123453')).toBe('0-1055-56123-45-3');
    expect(formatTaxId('abc')).toBe('abc');
    expect(formatTaxId(null)).toBe('');
  });

  it('explains what is wrong with a typed value', () => {
    expect(taxIdProblem('0-1055-56123-45-3')).toBeNull();
    expect(taxIdProblem('12')).toContain('13 หลัก');
    expect(taxIdProblem('0105556123456')).toContain('ไม่ถูกต้อง');
  });
});
