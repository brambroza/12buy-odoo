import { db } from '@/lib/db/client';
import { newId, rowOrNull, rows, unwrap } from '@/lib/db/rows';
import type { Dealer, PasswordResetRequest, User } from '@/lib/db/types';
import { audit } from './audit';
import { findUserByEmail } from './users';

const attempts = new Map<string, number[]>();

export const RESET_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 } as const;

/** Returns true when `key` (usually an IP) may submit another reset request right now. In-memory, per server instance. */
export function allowResetRequest(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < RESET_RATE_LIMIT.windowMs);
  if (recent.length >= RESET_RATE_LIMIT.max) {
    attempts.set(key, recent);
    return false;
  }
  attempts.set(key, [...recent, now]);
  return true;
}

/** Test helper. */
export function resetResetRateLimit() {
  attempts.clear();
}

/**
 * Records a "forgot password" request for an active user and notifies the team.
 * Unknown or inactive emails are silently ignored so the page never reveals
 * which emails have accounts. At most one pending request per user.
 */
export async function requestPasswordReset(input: { email: string; contact: string | null; ip: string | null }): Promise<void> {
  const user = await findUserByEmail(input.email);
  if (!user || !user.isActive) {
    await audit(null, 'password-reset.request-ignored', 'User', input.email.toLowerCase());
    return;
  }
  const existing = rowOrNull<PasswordResetRequest>(await db().from('PasswordResetRequest').select('*').eq('userId', user.id).eq('status', 'PENDING').limit(1).maybeSingle());
  if (existing) {
    if (input.contact && input.contact !== existing.contact) {
      unwrap(await db().from('PasswordResetRequest').update({ contact: input.contact }).eq('id', existing.id));
    }
    return;
  }
  const request = unwrap(await db().from('PasswordResetRequest').insert({ id: newId(), userId: user.id, contact: input.contact, ip: input.ip }).select('id').single()) as { id: string };
  await audit(user.id, 'password-reset.request', 'PasswordResetRequest', request.id);
  await notifyResetRequest({ id: request.id, email: user.email, name: user.name, shop: user.dealer?.name ?? null, contact: input.contact });
}

/** Marks every pending request of `userId` as handled (called after an admin issues a temporary password). */
export async function resolveResetRequests(userId: string, actorId: string, status: 'DONE' | 'DISMISSED' = 'DONE'): Promise<number> {
  const updated = unwrap(await db().from('PasswordResetRequest')
    .update({ status, resolvedAt: new Date().toISOString(), resolvedById: actorId })
    .eq('userId', userId).eq('status', 'PENDING').select('id'));
  return updated?.length ?? 0;
}

export type ResetRequestWithUser = PasswordResetRequest & { user: User & { dealer: Dealer | null } };

/** One request with its user (null when missing). */
export async function findResetRequest(id: string): Promise<ResetRequestWithUser | null> {
  return rowOrNull(await db().from('PasswordResetRequest').select('*, user:User!inner(*, dealer:Dealer(*))').eq('id', id).maybeSingle());
}

/** Open requests, oldest first, with user and shop for the admin inbox. */
export async function listPendingResetRequests(): Promise<ResetRequestWithUser[]> {
  return rows(await db().from('PasswordResetRequest').select('*, user:User!inner(*, dealer:Dealer(*))').eq('status', 'PENDING').order('createdAt'));
}

/**
 * Pings the team webhook (`LEAD_WEBHOOK_URL`, same relay as dealer leads).
 * Failures are logged, never thrown, so the requester always sees the same message.
 */
async function notifyResetRequest(payload: { id: string; email: string; name: string; shop: string | null; contact: string | null }): Promise<void> {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) {
    console.info('[password-reset] new request (no LEAD_WEBHOOK_URL set)', { id: payload.id });
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'password_reset_request', ...payload, createdAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('[password-reset] webhook failed', error instanceof Error ? error.message : error);
  }
}
