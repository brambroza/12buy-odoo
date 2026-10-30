import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { getCurrentUser } from '@/lib/auth/session';
import { getDealer } from '@/lib/dealers/repo';
import { ensurePdfFonts } from '@/lib/pdf/fonts';
import { OrderDocument } from '@/lib/pdf/order-document';
import { getSessionId } from '@/lib/shop/session';
import { getOrder } from '@/lib/shop/store';
import { dealerIdFromSession } from '@/lib/shop/odoo-sync';
import { formatTaxId } from '@/lib/tax-id';

export const dynamic = 'force-dynamic';

/** "ใบสั่งซื้อ" PDF of one order, for the dealer who owns it (or staff viewing as that dealer). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const order = await getOrder(await getSessionId(), id);
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const dealerId = dealerIdFromSession(order.sessionId);
  const dealer = dealerId ? await getDealer(dealerId) : null;
  ensurePdfFonts();
  const pdf = await renderToBuffer(createElement(OrderDocument, { order, dealer: { name: dealer?.name ?? order.dealerName, taxId: dealer?.taxId ? formatTaxId(dealer.taxId) : null, phone: dealer?.phone ?? null } }) as unknown as ReactElement<DocumentProps>);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${order.ref}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
