import { NextResponse } from 'next/server';
import { OdooService } from '@/lib/odoo';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

export async function GET(request: Request) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  try {
    const data = await new OdooService().searchSaleOrders(q, 50);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: 'Failed to search Odoo sale orders', error: message }, { status: 500 });
  }
}
