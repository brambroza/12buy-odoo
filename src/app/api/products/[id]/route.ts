import { NextResponse } from 'next/server';
import { deleteProduct, findProduct, updateProduct } from '@/lib/products';
import { productSchema } from '@/lib/validators';
import { OdooService } from '@/lib/odoo';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const row = await findProduct(id);
  if (!row) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  return NextResponse.json({ data: row });
}

export async function PUT(request: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid payload', errors: parsed.error.flatten() }, { status: 400 });
  const row = await updateProduct(id, { ...parsed.data, odooSyncStatus: 'LocalOnly', odooSyncError: null });
  if (!row) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  return NextResponse.json({ message: 'Product updated', data: row });
}

export async function DELETE(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const row = await findProduct(id);
  if (!row) return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  try {
    const odoo = new OdooService();
    await odoo.deleteProduct(row);
    const deleted = await deleteProduct(id);
    return NextResponse.json({ message: 'Product deleted', data: deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const updated = await updateProduct(id, { odooSyncStatus: 'Failed', odooSyncError: message });
    return NextResponse.json({ message: 'Delete product failed', error: message, data: updated }, { status: 500 });
  }
}
