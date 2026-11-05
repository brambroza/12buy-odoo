/**
 * Which company and period a commission page shows, from `?source=` and `?period=`.
 * Falls back to the first active company and the period that contains today (Bangkok).
 */
import { isPeriod, periodOf, recentPeriods, todayBangkok } from './period';
import { listSources } from './repo';
import type { CommissionSource } from './types';

export type CommissionContext = {
  sources: CommissionSource[];
  source: CommissionSource | null;
  period: string;
  periods: string[];
};

export async function commissionContext(params: { source?: string; period?: string }): Promise<CommissionContext> {
  const sources = await listSources();
  const source = sources.find((s) => s.id === params.source) ?? sources.find((s) => s.active) ?? sources[0] ?? null;
  const cutoff = source?.cutoffDay ?? 20;
  const today = todayBangkok();
  const periods = recentPeriods(today, cutoff, 13);
  const period = isPeriod(params.period) ? params.period : periodOf(today, cutoff);
  if (!periods.includes(period)) periods.push(period);
  periods.sort().reverse();
  return { sources, source, period, periods };
}

/** Query string that keeps the chosen company and period. */
export function ctxQuery(ctx: Pick<CommissionContext, 'source' | 'period'>, extra: Record<string, string | undefined> = {}): string {
  const sp = new URLSearchParams();
  if (ctx.source) sp.set('source', ctx.source.id);
  sp.set('period', ctx.period);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return sp.toString();
}
