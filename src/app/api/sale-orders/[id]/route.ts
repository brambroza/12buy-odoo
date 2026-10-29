import { NextResponse } from 'next/server';
import { findSaleOrder } from '@/lib/sale-orders';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const { id } = await params;
  const order = await findSaleOrder(id);
  if (!order) return NextResponse.json({ message: 'Order not found' }, { status: 404 });
  return NextResponse.json({ data: order });
}
