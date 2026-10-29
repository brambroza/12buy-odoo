import { NextResponse } from 'next/server';
import { findCustomer, updateCustomer } from '@/lib/customers';
import { OdooService } from '@/lib/odoo';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const row = await findCustomer(id);
  if (!row) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });
  await updateCustomer(id, { odooSyncStatus: 'Syncing', odooSyncError: null });
  try {
    const result = await new OdooService().syncCustomer(row);
    const updated = await updateCustomer(id, { odooPartnerId: result.id, odooSyncStatus: 'Synced', syncedAt: new Date() });
    return NextResponse.json({ message: 'Customer synced to Odoo', data: updated, odoo: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const updated = await updateCustomer(id, { odooSyncStatus: 'Failed', odooSyncError: message });
    return NextResponse.json({ message: 'Customer sync failed', error: message, data: updated }, { status: 500 });
  }
}
