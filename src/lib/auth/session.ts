import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { newId, rowOrNull, toRow, unwrap } from '@/lib/db/rows';
import type { Dealer, Session, User } from '@/lib/db/types';
import { generateSessionToken, hashToken } from './tokens';
import { isAdminRole, isBackofficeRole, isDealerRole, type Role } from './roles';

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
/** Server-side cap for a "don't remember me" session; the cookie itself also dies with the browser. */
const SHORT_SESSION_HOURS = 24;

export type CurrentUser = User & { dealer: Dealer | null };

/**
 * Creates a DB session for `userId` and sets the httpOnly cookie. Call from a server action or route handler.
 * `remember: false` sets a browser-session cookie and caps the DB session at 24 hours.
 */
export async function createSession(userId: string, { remember = true }: { remember?: boolean } = {}): Promise<void> {
  const token = generateSessionToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + (remember ? SESSION_DAYS * 86_400_000 : SHORT_SESSION_HOURS * 3_600_000));
  unwrap(await db().from('Session').insert(toRow({
    id: newId(), tokenHash: hashToken(token), userId, expiresAt, userAgent: h.get('user-agent')?.slice(0, 200) ?? null, ip: h.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) ?? null,
  })));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', ...(remember ? { expires: expiresAt } : {}) });
}

/** Deletes the current session row (if any) and clears the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) unwrap(await db().from('Session').delete().eq('tokenHash', hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Signs out every device of a user (used after password reset / deactivation). */
export async function revokeAllSessions(userId: string): Promise<void> {
  unwrap(await db().from('Session').delete().eq('userId', userId));
}

/** Resolves the signed-in user once per request (React cache). Null when no valid session. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = rowOrNull<Session & { user: CurrentUser }>(await db().from('Session').select('*, user:User!inner(*, dealer:Dealer(*))').eq('tokenHash', hashToken(token)).maybeSingle());
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  return session.user;
});

function loginUrl(reason?: string): string {
  const sp = new URLSearchParams();
  if (reason) sp.set('reason', reason);
  const q = sp.toString();
  return `/login${q ? `?${q}` : ''}`;
}

/** Any signed-in user, otherwise redirect to login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl());
  return user;
}

/** Back-office staff (admin, sales, warehouse). */
export async function requireBackoffice(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isBackofficeRole(user.role as Role)) redirect('/shop');
  return user;
}

/** Admin or super admin only. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdminRole(user.role as Role)) redirect(isBackofficeRole(user.role as Role) ? '/admin/orders?error=forbidden' : '/shop');
  return user;
}

/**
 * Dealer user with an ACTIVE shop, or a back-office user (who may browse the
 * shop in impersonation mode). Pending/suspended dealers are sent back to login
 * with a reason so the page can explain.
 */
export async function requireDealerAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  if (isBackofficeRole(user.role as Role)) return user;
  if (!isDealerRole(user.role as Role) || !user.dealer) redirect(loginUrl('no-dealer'));
  if (user.dealer.status !== 'ACTIVE') redirect(loginUrl(user.dealer.status === 'PENDING' ? 'pending' : 'suspended'));
  return user;
}
