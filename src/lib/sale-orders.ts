import { db } from '@/lib/db/client';
import { newId, rowOrNull, rows, toRow, unwrap } from '@/lib/db/rows';
import type { SaleOrderDraft, SaleOrderWithItems } from '@/types/sale-order';

const WITH_ITEMS = '*, items:SaleOrderItem(*)';

function todayPrefix() {
  return `WEB-SO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
}

async function nextOrderNo() {
  const prefix = todayPrefix();
  const { count, error } = await db().from('SaleOrder').select('id', { count: 'exact', head: true }).like('orderNo', `${prefix}%`);
  if (error) unwrap({ data: null, error });
  return `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

export async function listSaleOrders(): Promise<SaleOrderWithItems[]> {
  return rows(await db().from('SaleOrder').select(WITH_ITEMS).order('createdAt', { ascending: false }));
}

/**
 * Inserts the order then its items. PostgREST has no nested insert, so if the
 * items fail the order row is deleted again to avoid an empty order.
 */
export async function createSaleOrder(draft: SaleOrderDraft): Promise<SaleOrderWithItems> {
  const orderNo = await nextOrderNo();
  const id = newId();
  unwrap(await db().from('SaleOrder').insert({
    id,
    orderNo,
    odooPartnerId: draft.odooPartnerId,
    customerName: draft.customerName,
    taxId: draft.taxId ?? null,
    phone: draft.phone ?? null,
    email: draft.email ?? null,
    address: draft.address ?? null,
    remark: draft.remark ?? null,
  }));
  const items = await db().from('SaleOrderItem').insert(draft.items.map((item) => ({ ...item, id: newId(), saleOrderId: id })));
  if (items.error) {
    await db().from('SaleOrder').delete().eq('id', id);
    unwrap(items);
  }
  const created = await findSaleOrder(id);
  if (!created) throw new Error(`Sale order ${orderNo} vanished after insert`);
  return created;
}

export async function findSaleOrder(id: string): Promise<SaleOrderWithItems | null> {
  return rowOrNull(await db().from('SaleOrder').select(WITH_ITEMS).eq('id', id).maybeSingle());
}

export async function updateSaleOrder(id: string, patch: Partial<Omit<SaleOrderWithItems, 'items'>>): Promise<SaleOrderWithItems | null> {
  const { id: _id, createdAt: _createdAt, ...data } = patch;
  void _id; void _createdAt;
  const updated = unwrap(await db().from('SaleOrder').update(toRow(data)).eq('id', id).select('id'));
  if (!updated?.length) return null;
  return findSaleOrder(id);
}
