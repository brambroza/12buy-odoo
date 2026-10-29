import { describe, expect, it } from 'vitest';
import { generateTempPassword, hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { generateSessionToken, hashToken } from '@/lib/auth/tokens';
import { canManageRole, homeFor, isAdminRole, isBackofficeRole, isDealerRole } from '@/lib/auth/roles';

describe('password hashing', () => {
  it('round-trips and rejects wrong passwords', () => {
    const hash = hashPassword('Secret123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('Secret123', hash)).toBe(true);
    expect(verifyPassword('secret123', hash)).toBe(false);
    expect(verifyPassword('Secret123', 'garbage')).toBe(false);
  });

  it('uses a fresh salt per hash', () => {
    expect(hashPassword('Secret123')).not.toBe(hashPassword('Secret123'));
  });

  it('enforces length and letter+digit rule', () => {
    expect(passwordProblem('short1')).toBeTruthy();
    expect(passwordProblem('onlyletters')).toBeTruthy();
    expect(passwordProblem('12345678')).toBeTruthy();
    expect(passwordProblem('Secret123')).toBeNull();
  });

  it('generates temp passwords that pass the rule', () => {
    for (let i = 0; i < 20; i++) expect(passwordProblem(generateTempPassword())).toBeNull();
  });
});

describe('session tokens', () => {
  it('produces unique tokens and stable hashes', () => {
    const a = generateSessionToken(), b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('roles', () => {
  it('classifies roles and picks home routes', () => {
    expect(isBackofficeRole('ADMIN')).toBe(true);
    expect(isBackofficeRole('DEALER_OWNER')).toBe(false);
    expect(isDealerRole('DEALER_STAFF')).toBe(true);
    expect(isAdminRole('SALES')).toBe(false);
    expect(homeFor('SUPER_ADMIN')).toBe('/admin');
    expect(homeFor('DEALER_STAFF')).toBe('/shop');
  });

  it('limits who can manage whom', () => {
    expect(canManageRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(canManageRole('ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canManageRole('ADMIN', 'DEALER_OWNER')).toBe(true);
    expect(canManageRole('SALES', 'DEALER_OWNER')).toBe(false);
  });
});
