import { describe, expect, it } from 'vitest';
import { caretAfterFormat, formatAmount, formatMoneyText, moneyTextFrom, parseMoneyText, plainMoneyText, significantBeforeCaret } from '@/lib/money';

describe('formatMoneyText', () => {
  it('adds thousands commas', () => {
    expect(formatMoneyText('1234567')).toBe('1,234,567');
    expect(formatMoneyText('999')).toBe('999');
    expect(formatMoneyText('')).toBe('');
  });

  it('re-groups text that already has commas in the wrong place', () => {
    expect(formatMoneyText('12,34567')).toBe('1,234,567');
  });

  it('keeps a trailing dot and at most two decimals while typing', () => {
    expect(formatMoneyText('1000.')).toBe('1,000.');
    expect(formatMoneyText('1000.5')).toBe('1,000.5');
    expect(formatMoneyText('1000.567')).toBe('1,000.56');
    expect(formatMoneyText('.5')).toBe('0.5');
  });

  it('drops letters, extra dots, leading zeros and decimals when not allowed', () => {
    expect(formatMoneyText('฿1a2b3')).toBe('123');
    expect(formatMoneyText('1.2.3')).toBe('1.23');
    expect(formatMoneyText('0005000')).toBe('5,000');
    expect(formatMoneyText('0')).toBe('0');
    expect(formatMoneyText('1500.75', 0)).toBe('1,500');
  });

  it('caps the integer part at 12 digits', () => {
    expect(formatMoneyText('12345678901234')).toBe('123,456,789,012');
  });
});

describe('plainMoneyText / parseMoneyText', () => {
  it('strips commas for the form value', () => {
    expect(plainMoneyText('1,234,567.50')).toBe('1234567.50');
    expect(plainMoneyText('1,000.')).toBe('1000');
    expect(plainMoneyText('')).toBe('');
  });

  it('parses to a number or null', () => {
    expect(parseMoneyText('1,234.5')).toBe(1234.5);
    expect(parseMoneyText('')).toBeNull();
    expect(parseMoneyText('  ')).toBeNull();
  });
});

describe('moneyTextFrom', () => {
  it('formats stored amounts, including NUMERIC strings', () => {
    expect(moneyTextFrom(100000)).toBe('100,000');
    expect(moneyTextFrom('35000.00')).toBe('35,000');
    expect(moneyTextFrom(1234.5)).toBe('1,234.5');
    expect(moneyTextFrom(null)).toBe('');
    expect(moneyTextFrom(undefined)).toBe('');
    expect(moneyTextFrom('abc')).toBe('');
  });
});

describe('caret helpers', () => {
  it('keeps the caret after the same digit when a comma appears', () => {
    // "1000|" -> "1,000|"
    expect(caretAfterFormat('1,000', significantBeforeCaret('1000', 4))).toBe(5);
    // typed "5" after "1" in "1|,000" -> "15,000": caret after the 5
    expect(caretAfterFormat('15,000', significantBeforeCaret('15,000', 2))).toBe(2);
    // "12,34|5" -> "1,234,|5": caret after the 4
    expect(caretAfterFormat('12,345', significantBeforeCaret('12,345', 5))).toBe(5);
    expect(caretAfterFormat('1,000', 0)).toBe(0);
  });
});

describe('formatAmount', () => {
  it('uses commas and two decimals', () => {
    expect(formatAmount(1234.5)).toBe('1,234.50');
    expect(formatAmount(0)).toBe('0.00');
  });
});
