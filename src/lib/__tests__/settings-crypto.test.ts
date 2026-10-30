import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret, hasDedicatedSecret } from '@/lib/settings/crypto';

describe('settings crypto', () => {
  beforeEach(() => vi.stubEnv('SETTINGS_SECRET', 'a-very-long-random-secret-for-tests-1234'));
  afterEach(() => vi.unstubAllEnvs());

  it('round-trips a secret with a fresh iv each time', () => {
    const a = encryptSecret('odoo-api-key-xyz');
    const b = encryptSecret('odoo-api-key-xyz');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(decryptSecret(a)).toBe('odoo-api-key-xyz');
    expect(decryptSecret(b)).toBe('odoo-api-key-xyz');
    expect(a).not.toContain('odoo-api-key');
  });

  it('refuses tokens sealed with another secret or tampered with', () => {
    const token = encryptSecret('k');
    vi.stubEnv('SETTINGS_SECRET', 'another-secret-another-secret-another');
    expect(() => decryptSecret(token)).toThrow();
    vi.stubEnv('SETTINGS_SECRET', 'a-very-long-random-secret-for-tests-1234');
    expect(() => decryptSecret(token.slice(0, -2) + 'AA')).toThrow();
    expect(() => decryptSecret('nonsense')).toThrow('Unknown secret format');
  });

  it('falls back to the service role key and reports that no dedicated secret is set', () => {
    vi.stubEnv('SETTINGS_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-service-role-key');
    expect(hasDedicatedSecret()).toBe(false);
    expect(decryptSecret(encryptSecret('k2'))).toBe('k2');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(() => encryptSecret('k3')).toThrow('SETTINGS_SECRET');
  });
});
