import { describe, expect, it } from 'vitest';
import { decodeFlash, encodeFlash } from '../flash-shared';

describe('flash codec', () => {
  it('round-trips Thai text, commas and semicolons in a cookie-safe value', () => {
    const flash = { id: 'a1', type: 'success' as const, title: 'ส่งคำสั่งซื้อสำเร็จ', description: 'WEB-20261029-001 · ยอด ฿12,500.00; โอนแล้วแนบสลิป', icon: 'order' as const };
    const value = encodeFlash(flash);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFlash(value)).toEqual(flash);
  });

  it('rejects missing, malformed or title-less values', () => {
    expect(decodeFlash(undefined)).toBeNull();
    expect(decodeFlash('not base64 !!')).toBeNull();
    expect(decodeFlash(encodeFlash({ id: 'x', type: 'info', title: '' }))).toBeNull();
  });

  it('falls back to success for an unknown type and caps long text', () => {
    const decoded = decodeFlash(encodeFlash({ id: 'x', type: 'bogus' as never, title: 'ก'.repeat(500) }));
    expect(decoded?.type).toBe('success');
    expect(decoded?.title).toHaveLength(160);
    expect(decoded?.description).toBeUndefined();
  });
});
