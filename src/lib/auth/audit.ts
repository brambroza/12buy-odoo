import { db } from '@/lib/db/client';
import { newId } from '@/lib/db/rows';

/** Appends an audit row. Never throws: an audit failure must not break the user action. */
export async function audit(userId: string | null, action: string, entity: string, entityId: string, diff?: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await db().from('AuditLog').insert({ id: newId(), userId, action, entity, entityId, diff: diff ? JSON.parse(JSON.stringify(diff)) : null });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('[audit] failed', action, entity, entityId, error instanceof Error ? error.message : error);
  }
}
