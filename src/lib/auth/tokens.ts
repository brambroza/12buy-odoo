import { createHash, randomBytes } from 'node:crypto';

/** Opaque session token sent to the browser (never stored as-is). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 of the token; only this is stored in the database. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
