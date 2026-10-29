/**
 * Pulls order progress from Odoo (delivery, invoice, payment) into web orders — read-only on Odoo.
 * Runs from the cron route, the admin "ดึงสถานะจาก Odoo" button, and lazily when a dealer opens an order.
 */
import { readOdooProgress, webStatusFromOdoo } from '@/lib/odoo/order-status';
import * as store from './store';
import type { ProtoOrder } from './types';

/** Orders whose status Odoo can still move: linked to an SO and not finished. */
export function isTrackable(order: ProtoOrder): boolean {
  return Boolean(order.odoo?.saleOrderId) && order.status !== 'PAID' && order.status !== 'CANCELLED';
}

/** Refreshes the given orders (default: every trackable order). Returns how many changed status. */
export async function refreshOrderStatuses(orders?: ProtoOrder[]): Promise<{ checked: number; changed: number }> {
  const targets = (orders ?? await store.listAllOrders()).filter(isTrackable);
  if (!targets.length) return { checked: 0, changed: 0 };
  const progress = await readOdooProgress(targets.map((o) => o.odoo!.saleOrderId!));
  let changed = 0;
  const checkedAt = new Date().toISOString();
  for (const order of targets) {
    const p = progress.get(order.odoo!.saleOrderId!);
    if (!p) continue;
    const updated = await store.applyOdooProgress(order, webStatusFromOdoo(p), { deliveryStatus: p.deliveryStatus, invoices: p.invoices, checkedAt });
    if (updated.status !== order.status) changed += 1;
  }
  return { checked: targets.length, changed };
}

/** For a dealer opening one order: refresh it when the last Odoo check is older than `maxAgeMs`. Never throws. */
export async function refreshIfStale(order: ProtoOrder, maxAgeMs = 5 * 60 * 1000): Promise<ProtoOrder> {
  if (!isTrackable(order)) return order;
  const last = order.odoo?.progress?.checkedAt ? Date.parse(order.odoo.progress.checkedAt) : 0;
  if (Date.now() - last < maxAgeMs) return order;
  try {
    await refreshOrderStatuses([order]);
    return (await store.getOrder(null, order.id)) ?? order;
  } catch (error) {
    console.error('[status-sync] refresh failed', error instanceof Error ? error.message : error);
    return order;
  }
}
