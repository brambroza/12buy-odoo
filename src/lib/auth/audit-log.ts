/** Reading the audit trail for /admin/audit. */
import { db } from '@/lib/db/client';
import { rows } from '@/lib/db/rows';
import type { AuditLog } from '@/lib/db/types';

export type AuditFilter = { q?: string; action?: string; entity?: string; userId?: string; from?: string; to?: string };
export type AuditRow = AuditLog & { createdAt: Date; user: { id: string; name: string; email: string; role: string } | null };

/**
 * Newest audit rows matching the filter (at most `limit`). Text search covers action, entity and entity id;
 * `from`/`to` are inclusive Thai calendar days.
 */
export async function listAuditLogs(filter: AuditFilter = {}, limit = 500): Promise<AuditRow[]> {
  let q = db().from('AuditLog').select('*, user:User(id, name, email, role)').order('createdAt', { ascending: false }).limit(limit);
  if (filter.action) q = q.like('action', `${filter.action.replace(/[%_]/g, '')}%`);
  if (filter.entity) q = q.eq('entity', filter.entity);
  if (filter.userId) q = q.eq('userId', filter.userId);
  if (filter.from) q = q.gte('createdAt', `${filter.from}T00:00:00+07:00`);
  if (filter.to) q = q.lte('createdAt', `${filter.to}T23:59:59.999+07:00`);
  const data = rows<AuditLog & { user: AuditRow['user']; createdAt: string | Date }>(await q);
  const text = (filter.q ?? '').trim().toLowerCase();
  return data
    .map((r) => ({ ...r, createdAt: new Date(typeof r.createdAt === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(r.createdAt) ? `${r.createdAt}Z` : r.createdAt) }))
    .filter((r) => !text || [r.action, r.entity, r.entityId, r.user?.name, r.user?.email, JSON.stringify(r.diff ?? '')].some((v) => String(v ?? '').toLowerCase().includes(text)));
}

/** Distinct action prefixes (before the first dot) and entities seen recently, for the filter chips. */
export function auditFacets(rowsIn: readonly AuditRow[]): { actions: string[]; entities: string[] } {
  return {
    actions: [...new Set(rowsIn.map((r) => r.action.split('.')[0]))].sort(),
    entities: [...new Set(rowsIn.map((r) => r.entity))].sort(),
  };
}
