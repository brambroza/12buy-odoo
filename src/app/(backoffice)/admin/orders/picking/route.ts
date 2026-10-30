import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { audit } from '@/lib/auth/audit';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/session';
import { ensurePdfFonts } from '@/lib/pdf/fonts';
import { PickingDocument } from '@/lib/pdf/picking-document';
import { listAllOrders } from '@/lib/shop/store';

export const dynamic = 'force-dynamic';

/** Picking / delivery notes for one or many orders (`?ids=a,b,c`), one page each. Warehouse-side permission. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role as Role, 'order.ship') && !can(user.role as Role, 'order.confirm')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 50);
  if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });
  const wanted = new Set(ids);
  const orders = (await listAllOrders()).filter((o) => wanted.has(o.id) && o.status !== 'CANCELLED');
  if (!orders.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
  ensurePdfFonts();
  const pdf = await renderToBuffer(createElement(PickingDocument, { orders }) as unknown as ReactElement<DocumentProps>);
  await audit(user.id, 'order.print_picking', 'ShopOrder', orders.map((o) => o.ref).join(','), { count: orders.length });
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="picking-${orders.length === 1 ? orders[0].ref : `${orders.length}-orders`}.pdf"`, 'Cache-Control': 'private, no-store' } });
}
