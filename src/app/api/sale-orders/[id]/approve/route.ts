import { NextResponse } from 'next/server';
import { findSaleOrder, updateSaleOrder } from '@/lib/sale-orders';
import { OdooService } from '@/lib/odoo';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;

  const order = await findSaleOrder(id);
  if (!order) return NextResponse.json({ message: 'Order not found' }, { status: 404 });

  await updateSaleOrder(id, {
    approvalStatus: 'Approved',
    odooSyncStatus: 'Syncing',
    approvedAt: new Date(),
    odooSyncError: null,
  });

  try {
    const odoo = new OdooService();
    const result = await odoo.syncSaleOrder(order);

    const updated = await updateSaleOrder(id, {
      odooSyncStatus: 'Synced',
      odooSaleOrderId: result.id,
      odooSaleOrderName: result.name,
      syncedAt: new Date(),
    });

    return NextResponse.json({ message: 'Approved and synced to Odoo', data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const updated = await updateSaleOrder(id, {
      odooSyncStatus: 'Failed',
      odooSyncError: message,
    });

    return NextResponse.json({ message: 'Approved but Odoo sync failed', error: message, data: updated }, { status: 500 });
  }
}
