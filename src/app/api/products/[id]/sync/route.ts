import { NextResponse } from 'next/server';
import { findProduct, updateProduct } from '@/lib/products';
import { OdooService } from '@/lib/odoo';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const row = await findProduct(id);
  if (!row) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  await updateProduct(id, { odooSyncStatus: 'Syncing', odooSyncError: null });
  try {
    const result = await new OdooService().syncProduct(row);
    const updated = await updateProduct(id, { odooProductId: result.id, odooSyncStatus: 'Synced', syncedAt: new Date() });
    return NextResponse.json({ message: 'Product synced to Odoo', data: updated, odoo: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const updated = await updateProduct(id, { odooSyncStatus: 'Failed', odooSyncError: message });
    return NextResponse.json({ message: 'Product sync failed', error: message, data: updated }, { status: 500 });
  }
}
