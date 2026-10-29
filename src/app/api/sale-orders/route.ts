import { NextResponse } from 'next/server';
import { createSaleOrder, listSaleOrders } from '@/lib/sale-orders';
import { saleOrderDraftSchema } from '@/lib/validators';
import { denyUnlessBackoffice } from '@/lib/auth/api-guard';

export async function GET() {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  return NextResponse.json({ data: await listSaleOrders() });
}

export async function POST(request: Request) {
  const denied = await denyUnlessBackoffice();
  if (denied) return denied;
  const body = await request.json();
  const parsed = saleOrderDraftSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid payload', errors: parsed.error.flatten() }, { status: 400 });
  }

  const order = await createSaleOrder(parsed.data);
  return NextResponse.json({ message: 'Draft created', data: order });
}
