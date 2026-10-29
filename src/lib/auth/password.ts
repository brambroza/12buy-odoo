import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384, R = 8, P = 1, KEYLEN = 64;

/** Hashes a password with scrypt. Format: `scrypt$N$r$p$salt$hash` (base64url). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

/** Constant-time verification against a hash produced by `hashPassword`. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64url');
  try {
    const actual = scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Minimum rules for dealer/admin passwords. Returns a Thai error message or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'รหัสผ่านอย่างน้อย 8 ตัวอักษร';
  if (password.length > 128) return 'รหัสผ่านยาวเกินไป';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  return null;
}

/** Random, human-typable temporary password (no ambiguous characters). */
export function generateTempPassword(length = 10): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  // Guarantee the letter+digit rule.
  return /\d/.test(out) && /[a-zA-Z]/.test(out) ? out : `${out.slice(0, -2)}a7`;
}
