import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dealerLeadSchema, leadFromFormData } from '@/lib/leads/schema';
import { RATE_LIMIT, allowSubmission, resetRateLimit, toNotification } from '@/lib/leads/store';
import { verifyTurnstile } from '@/lib/security/turnstile';

const address = { line: '99/1 ม.3', province: 'เชียงใหม่', district: 'กัลยาณิวัฒนา', subdistrict: 'บ้านจันทร์', postalCode: '58130' };
const valid = {
  shopName: 'ร้านยางทดสอบ', address, types: ['CAR'], phone: '081-234-5678', lineId: '@shop',
  email: ' Shop@Example.com ', password: 'abc12345', confirmPassword: 'abc12345', website: '',
};
const issue = (input: unknown) => {
  const r = dealerLeadSchema.safeParse(input);
  return r.success ? null : r.error.issues[0];
};

describe('dealerLeadSchema', () => {
  it('accepts a complete lead and normalises email and phone', () => {
    const r = dealerLeadSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('shop@example.com');
      expect(r.data.phone).toBe('0812345678');
      expect(r.data.address.province).toBe('เชียงใหม่');
    }
  });

  it('requires a real province / district / subdistrict combination', () => {
    expect(issue({ ...valid, address: { ...address, subdistrict: 'ไม่มีจริง' } })?.path).toEqual(['address', 'subdistrict']);
    expect(issue({ ...valid, address: { ...address, province: '' } })).not.toBeNull();
    expect(issue({ ...valid, address: { ...address, line: '' } })?.path).toEqual(['address', 'line']);
  });

  it('checks email, password strength and the confirmation', () => {
    expect(issue({ ...valid, email: 'not-an-email' })?.path).toEqual(['email']);
    expect(issue({ ...valid, password: 'short1', confirmPassword: 'short1' })?.message).toContain('8');
    expect(issue({ ...valid, password: 'onlyletters', confirmPassword: 'onlyletters' })?.message).toContain('ตัวเลข');
    expect(issue({ ...valid, confirmPassword: 'abc12346' })).toMatchObject({ path: ['confirmPassword'], message: 'ยืนยันรหัสผ่านไม่ตรงกัน' });
  });

  it('rejects empty types, bad phone and a filled honeypot', () => {
    expect(issue({ ...valid, types: [] })).not.toBeNull();
    expect(issue({ ...valid, phone: '12345' })).not.toBeNull();
    expect(issue({ ...valid, website: 'http://spam' })).not.toBeNull();
  });

  it('reads the address picker and multi-value types from FormData', () => {
    const fd = new FormData();
    fd.set('shopName', 'A1 Tyre');
    for (const [k, v] of Object.entries(address)) fd.set(k, v);
    fd.append('types', 'CAR');
    fd.append('types', 'TRUCK');
    fd.set('phone', '0812345678');
    fd.set('email', 'a1@example.com');
    fd.set('password', 'abc12345');
    fd.set('confirmPassword', 'abc12345');
    const parsed = dealerLeadSchema.safeParse(leadFromFormData(fd));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.types).toEqual(['CAR', 'TRUCK']);
  });

  it('never puts the password in the sales notification', () => {
    const r = dealerLeadSchema.parse(valid);
    const n = toNotification(r, { id: 'L1', createdAt: '2026-10-29', source: 'landing' });
    expect(JSON.stringify(n)).not.toContain('abc12345');
    expect(n).toMatchObject({ province: 'เชียงใหม่', email: 'shop@example.com', id: 'L1' });
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

describe('verifyTurnstile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('skips the check without a secret in development, refuses in production', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(await verifyTurnstile('')).toEqual({ ok: true });
    vi.stubEnv('NODE_ENV', 'production');
    expect((await verifyTurnstile('token')).ok).toBe(false);
  });

  it('requires a token and sends it with the secret and IP to Cloudflare', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-x');
    expect((await verifyTurnstile('')).ok).toBe(false);
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await verifyTurnstile('tok', '1.2.3.4')).toEqual({ ok: true });
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: 'secret-x', response: 'tok', remoteip: '1.2.3.4' });
  });

  it('fails closed when Cloudflare rejects the token or is unreachable', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-x');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) }));
    expect((await verifyTurnstile('bad')).ok).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect((await verifyTurnstile('tok')).ok).toBe(false);
  });
});
