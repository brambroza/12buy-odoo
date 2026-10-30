import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { odooPing } from '@/lib/odoo/rpc';

export const dynamic = 'force-dynamic';

type Check = { ok: boolean; latencyMs: number };
type Health = { status: 'ok' | 'degraded' | 'down'; db: Check; odoo: Check; checkedAt: string };

const TTL_MS = 60_000;
let cached: { at: number; body: Health } | null = null;

async function timed(run: () => Promise<unknown>): Promise<Check> {
  const started = Date.now();
  try {
    await run();
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

/**
 * Liveness for UptimeRobot / the admin top bar. No auth, no details beyond ok/latency:
 * 200 when the database answers (Odoo may be degraded), 503 when the database does not.
 * Results are cached for a minute so monitors cannot hammer Odoo.
 */
export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const [dbCheck, odooCheck] = await Promise.all([
      timed(async () => {
        const { error } = await db().from('AppSetting').select('key', { head: true, count: 'exact' }).limit(1);
        if (error && !/does not exist/i.test(error.message)) throw new Error(error.message);
      }),
      timed(() => odooPing()),
    ]);
    const status: Health['status'] = !dbCheck.ok ? 'down' : odooCheck.ok ? 'ok' : 'degraded';
    cached = { at: Date.now(), body: { status, db: dbCheck, odoo: odooCheck, checkedAt: new Date().toISOString() } };
  }
  return NextResponse.json(cached.body, { status: cached.body.status === 'down' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
