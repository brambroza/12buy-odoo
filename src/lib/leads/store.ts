import { RATE_LIMITS, hitRateLimit } from '@/lib/security/rate-limit';
import type { DealerLeadInput } from './schema';

/** Lead shape passed to the notifier. Never contains the password (see `toNotification`). */
export type LeadNotification = Omit<DealerLeadInput, 'password' | 'confirmPassword' | 'website' | 'consent'> & { province: string; id: string; createdAt: string | Date; source: string };

/** Builds the webhook payload from a validated lead, dropping the password fields. */
export function toNotification(input: DealerLeadInput, meta: { id: string; createdAt: string | Date; source: string }): LeadNotification {
  const { password: _p, confirmPassword: _c, website: _w, consent: _k, ...safe } = input;
  return { ...safe, province: input.address.province, ...meta };
}

/** Returns true when `key` (usually an IP) may submit another lead right now (shared limiter, see `rate-limit.ts`). */
export async function allowSubmission(key: string): Promise<boolean> {
  return (await hitRateLimit('lead', key, RATE_LIMITS.lead)).ok;
}

/**
 * Pushes the lead to the sales team. Uses `LEAD_WEBHOOK_URL` (any JSON webhook,
 * e.g. LINE Messaging API relay or Make/Zapier). Failures are logged, never thrown,
 * so the dealer always sees a success message once the lead is stored.
 */
export async function notifyLead(lead: LeadNotification): Promise<void> {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) {
    console.info('[lead] new dealer lead (no LEAD_WEBHOOK_URL set)', { id: lead.id, shop: lead.shopName, province: lead.province });
    return;
  }
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead), signal: AbortSignal.timeout(8000) });
  } catch (error) {
    console.error('[lead] webhook failed', error instanceof Error ? error.message : error);
  }
}
