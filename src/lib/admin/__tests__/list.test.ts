import { describe, expect, it } from 'vitest';
import { listHref, matchesSearch, pageWindow, paginate, searchText } from '@/lib/admin/list';

describe('searchText', () => {
  it('trims, lower-cases and caps the length', () => {
    expect(searchText('  ABC  ')).toBe('abc');
    expect(searchText(undefined)).toBe('');
    expect(searchText('x'.repeat(100))).toHaveLength(80);
  });
});

describe('matchesSearch', () => {
  it('matches any field, ignoring case and empty values', () => {
    expect(matchesSearch('', 'a')).toBe(true);
    expect(matchesSearch('ยาง', null, 'ร้านยางดี')).toBe(true);
    expect(matchesSearch('web-1', 'WEB-123')).toBe(true);
    expect(matchesSearch('42', 42)).toBe(true);
    expect(matchesSearch('zz', 'abc', undefined, false)).toBe(false);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  it('returns the requested page', () => {
    const page = paginate(items, '2', 20);
    expect(page.items[0]).toBe(21);
    expect(page).toMatchObject({ page: 2, pageCount: 3, total: 45, from: 21, to: 40 });
  });

  it('clamps out-of-range and invalid pages', () => {
    expect(paginate(items, '99', 20).page).toBe(3);
    expect(paginate(items, '99', 20).items).toEqual([41, 42, 43, 44, 45]);
    expect(paginate(items, '-3', 20).page).toBe(1);
    expect(paginate(items, 'abc', 20).page).toBe(1);
    expect(paginate(items, undefined, 20).page).toBe(1);
  });

  it('handles an empty list', () => {
    expect(paginate([], '3')).toEqual({ items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
  });
});

describe('listHref', () => {
  it('keeps current params and applies changes', () => {
    expect(listHref('/admin/x', { q: 'ab', status: 'NEW', page: '3' }, { page: undefined, open: 'id1' })).toBe('/admin/x?q=ab&status=NEW&open=id1');
  });

  it('drops empty and non-string values', () => {
    expect(listHref('/admin/x', { q: '', tags: ['a'] })).toBe('/admin/x');
    expect(listHref('/admin/x', { q: 'a' }, { q: '' })).toBe('/admin/x');
  });

  it('encodes values', () => {
    expect(listHref('/admin/x', {}, { q: 'a b&c' })).toBe('/admin/x?q=a+b%26c');
  });
});

describe('pageWindow', () => {
  it('shows first, last and neighbours with gaps', () => {
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});
