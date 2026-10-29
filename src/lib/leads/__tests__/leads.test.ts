import { beforeEach, describe, expect, it } from 'vitest';
import { dealerLeadSchema, leadFromFormData, type DealerLeadInput } from '@/lib/leads/schema';
import { RATE_LIMIT, allowSubmission, resetRateLimit } from '@/lib/leads/store';

const valid: DealerLeadInput = { shopName: 'ร้านยางทดสอบ', province: 'เชียงใหม่', types: ['CAR'], phone: '081-234-5678', lineId: '@shop', website: '' };

describe('dealerLeadSchema', () => {
  it('accepts a complete lead', () => {
    expect(dealerLeadSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unknown province, empty types and bad phone', () => {
    expect(dealerLeadSchema.safeParse({ ...valid, province: 'Mars' }).success).toBe(false);
    expect(dealerLeadSchema.safeParse({ ...valid, types: [] }).success).toBe(false);
    expect(dealerLeadSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
  });

  it('rejects filled honeypot', () => {
    expect(dealerLeadSchema.safeParse({ ...valid, website: 'http://spam' }).success).toBe(false);
  });

  it('reads multi-value types from FormData', () => {
    const fd = new FormData();
    fd.set('shopName', 'A1 Tyre');
    fd.set('province', 'ขอนแก่น');
    fd.append('types', 'CAR');
    fd.append('types', 'TRUCK');
    fd.set('phone', '0812345678');
    const parsed = dealerLeadSchema.safeParse(leadFromFormData(fd));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.types).toEqual(['CAR', 'TRUCK']);
  });
});

describe('lead rate limit', () => {
  beforeEach(() => resetRateLimit());

  it('limits submissions per key inside the window', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT.max; i++) expect(allowSubmission('ip-1', t0 + i)).toBe(true);
    expect(allowSubmission('ip-1', t0 + 10)).toBe(false);
    expect(allowSubmission('ip-2', t0 + 10)).toBe(true);
    expect(allowSubmission('ip-1', t0 + RATE_LIMIT.windowMs + 1)).toBe(true);
  });
});
