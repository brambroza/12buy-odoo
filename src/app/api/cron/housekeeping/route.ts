import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { notifyOdooFailure } from '@/lib/notify';
import { canSyncOrder, syncOrderToOdoo } from '@/lib/shop/odoo-sync';
import { listAllOrders } from '@/lib/shop/store';

export const dynamic = 'force-dynamic';
const log = logger('housekeeping');

const DAY_MS = 86_400_000;
/** Odoo pushes are retried for a day, at most this many times per order. */
const MAX_RETRIES = 3;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function purge(table: string, column: string, before: Date, onlyRead = false): Promise<number> {
  const base = db().from(table).delete({ count: 'exact' }).lt(column, before.toISOString());
  const { count, error } = await (onlyRead ? base.not('readAt', 'is', null) : base);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

/**
 * Daily maintenance (scheduler calls with the cron secret):
 * - re-push confirmed orders whose Odoo sync failed in the last 24 h (max 3 tries, staff group told on the last failure)
 * - delete expired sessions, stale rate-limit windows, read notifications older than 90 days, audit rows older than 1 year
 */
export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const now = Date.now();
  const result: Record<string, number | string> = {};
  try {
    const orders = (await listAllOrders()).filter((o) => canSyncOrder(o) && o.odoo?.status === 'FAILED' && o.odoo.at && now - Date.parse(o.odoo.at) < DAY_MS && (o.odoo.retries ?? 0) < MAX_RETRIES);
    let retried = 0;
    let recovered = 0;
    for (const order of orders) {
      const attempt = (order.odoo?.retries ?? 0) + 1;
      const outcome = await syncOrderToOdoo({ ...order, odoo: order.odoo ? { ...order.odoo, retries: attempt } : undefined });
      retried += 1;
      if (outcome.status !== 'FAILED') recovered += 1;
      else if (attempt >= MAX_RETRIES) await notifyOdooFailure(order, `ส่งออเดอร์เข้า Odoo (ลองซ้ำครบ ${MAX_RETRIES} ครั้ง) `, outcome.error ?? 'unknown');
    }
    result.odooRetried = retried;
    result.odooRecovered = recovered;
  } catch (error) {
    log.error('odoo retry sweep failed', { error });
    result.odooRetry = 'failed';
  }
  const jobs: [string, () => Promise<number>][] = [
    ['sessionsPurged', () => purge('Session', 'expiresAt', new Date(now))],
    ['rateLimitsPurged', () => purge('RateLimit', 'updatedAt', new Date(now - DAY_MS))],
    ['notificationsPurged', () => purge('Notification', 'createdAt', new Date(now - 90 * DAY_MS), true)],
    ['auditPurged', () => purge('AuditLog', 'createdAt', new Date(now - 365 * DAY_MS))],
  ];
  for (const [key, run] of jobs) {
    try {
      result[key] = await run();
    } catch (error) {
      log.warn(`${key} skipped`, { error });
      result[key] = 'skipped';
    }
  }
  log.info('done', result);
  return NextResponse.json({ ok: true, ...result });
}
