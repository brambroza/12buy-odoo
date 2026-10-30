/**
 * Top-bar notification bell: the dashboard's to-do list (`buildTasks`) for the signed-in staff member,
 * plus the badge number. Skips the Odoo delivery-carrier check, which needs a slow XML-RPC call.
 */
import * as admin from '@/lib/admin/store';
import { buildTasks, type DashboardTask } from '@/lib/admin/dashboard';
import { listPendingResetRequests } from '@/lib/auth/reset-requests';
import { isAdminRole, type Role } from '@/lib/auth/roles';
import { listDealers } from '@/lib/dealers/repo';
import { listLeads } from '@/lib/leads/repo';
import { listAllOrders } from '@/lib/shop/store';

export type BellItem = Pick<DashboardTask, 'id' | 'priority' | 'title' | 'detail' | 'count' | 'href'>;
export type BellData = { items: BellItem[]; badge: number };

/**
 * Badge number: items someone must act on now (urgent or today). Follow-ups ("soon") are listed
 * but not counted, so the badge only rings for real work.
 */
export function bellBadge(items: readonly Pick<BellItem, 'priority' | 'count'>[]): number {
  return items.filter((i) => i.priority !== 'soon').reduce((sum, i) => sum + Math.max(i.count, 1), 0);
}

/** Resolves to `fallback` when a source fails, so one broken source never hides the others. */
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error('[admin/notifications]', error instanceof Error ? error.message : error);
    return fallback;
  }
}

/** Loads what is waiting for `role` (admin-only items are hidden from sales/warehouse). */
export async function loadBell(role: Role, now = Date.now()): Promise<BellData> {
  const isAdmin = isAdminRole(role);
  const [orders, leads, pendingDealers, books, zones, resets] = await Promise.all([
    safe(listAllOrders(), []),
    safe(listLeads('NEW'), []),
    safe(listDealers({ status: 'PENDING' }), []),
    isAdmin ? safe(admin.listBooks(), []) : Promise.resolve([]),
    isAdmin ? safe(admin.listZones(), []) : Promise.resolve([]),
    isAdmin ? safe(listPendingResetRequests(), []) : Promise.resolve([]),
  ]);
  const booksPending = books.filter((b) => b.status === 'PENDING_APPROVAL')
    .map((b) => ({ id: b.id, label: `${zones.find((z) => z.id === b.zoneId)?.name ?? 'โซน'} · ${b.tier}` }));
  const oldest = leads.at(-1)?.createdAt;
  const items = buildTasks({
    orders, now, newLeads: leads.length, oldestNewLeadAt: oldest ? new Date(oldest).toISOString() : null,
    pendingDealers: pendingDealers.length, booksPending, resetRequests: resets.length, publishedCarriers: null,
  }).filter((t) => isAdmin || !t.adminOnly)
    .map(({ id, priority, title, detail, count, href }) => ({ id, priority, title, detail, count, href }));
  return { items, badge: bellBadge(items) };
}
