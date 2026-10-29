import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { refreshOrderStatuses } from '@/lib/shop/status-sync';

/** True when the request carries `Authorization: Bearer <CRON_SECRET>`. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled pull of delivery/invoice/payment status from Odoo into web orders (read-only on Odoo).
 * Call every 5–10 minutes from the scheduler (DigitalOcean job / GitHub Actions) with the secret.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await refreshOrderStatuses());
  } catch (error) {
    console.error('[cron] odoo status sync failed', error);
    return NextResponse.json({ error: 'sync failed' }, { status: 502 });
  }
}
