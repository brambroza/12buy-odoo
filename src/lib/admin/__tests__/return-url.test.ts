import { describe, expect, it } from 'vitest';
import { returnUrl } from '@/lib/admin/return-url';

describe('returnUrl', () => {
  it('returns to the posting page with its filters and drawer', () => {
    expect(returnUrl('https://shop.example/admin/zones?edit=z1&q=north&page=2', '/admin/zones', { error: 'ตั้งชื่อโซน' }))
      .toBe('/admin/zones?edit=z1&q=north&page=2&error=%E0%B8%95%E0%B8%B1%E0%B9%89%E0%B8%87%E0%B8%8A%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B9%82%E0%B8%8B%E0%B8%99');
  });

  it('drops old one-off flags and can remove params', () => {
    expect(returnUrl('/admin/orders?status=PENDING&error=old&info=x&open=o1', '/admin/orders', { open: undefined })).toBe('/admin/orders?status=PENDING');
  });

  it('falls back to the prefix for other pages, origins tricks or no referer', () => {
    expect(returnUrl('https://evil.example/phish', '/admin/zones')).toBe('/admin/zones');
    expect(returnUrl('/admin/zonesx?q=1', '/admin/zones')).toBe('/admin/zones');
    expect(returnUrl('//evil.example/admin/zones', '/admin/zones')).toBe('/admin/zones');
    expect(returnUrl(null, '/admin/groups', { error: 'x' })).toBe('/admin/groups?error=x');
  });

  it('keeps only the path of an absolute referer', () => {
    expect(returnUrl('https://evil.example/admin/zones?q=a', '/admin/zones')).toBe('/admin/zones?q=a');
  });
});
