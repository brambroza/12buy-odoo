import { NextResponse } from 'next/server';
import { deleteCustomer, findCustomer, updateCustomer } from '@/lib/customers';
import { customerSchema } from '@/lib/validators';
import { OdooService } from '@/lib/odoo';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const row = await findCustomer(id);
  if (!row) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });
  return NextResponse.json({ data: row });
}

export async function PUT(request: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json();
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid payload', errors: parsed.error.flatten() }, { status: 400 });
  const row = await updateCustomer(id, { ...parsed.data, odooSyncStatus: 'LocalOnly', odooSyncError: null });
  if (!row) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });
  return NextResponse.json({ message: 'Customer updated', data: row });
}

export async function DELETE(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const row = await findCustomer(id);
  if (!row) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });
  try {
    const odoo = new OdooService();
    await odoo.deleteCustomer(row);
    const deleted = await deleteCustomer(id);
    return NextResponse.json({ message: 'Customer deleted', data: deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const updated = await updateCustomer(id, { odooSyncStatus: 'Failed', odooSyncError: message });
    return NextResponse.json({ message: 'Delete customer failed', error: message, data: updated }, { status: 500 });
  }
}
