import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getDealer } from '@/lib/dealers/repo';
import { logger } from '@/lib/logger';
import { fetchInvoicePdf } from '@/lib/odoo/invoice-pdf';
import { dealerIdFromSession, partnerIdFromSession } from '@/lib/shop/odoo-sync';
import { getSessionId } from '@/lib/shop/session';
import { getOrder } from '@/lib/shop/store';

export const dynamic = 'force-dynamic';
const log = logger('invoice-pdf');

/**
 * Streams the Odoo invoice PDF for an invoice of the dealer's own order. The move must be listed on
 * the order's Odoo progress and belong to the dealer's partner, so a dealer can never fetch another
 * shop's document by guessing ids.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; moveId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, moveId: rawMove } = await params;
  const moveId = Number(rawMove);
  if (!Number.isInteger(moveId) || moveId <= 0) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const order = await getOrder(await getSessionId(), id);
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const listed = order.odoo?.progress?.invoices.some((inv) => inv.id === moveId) || order.odoo?.invoice?.id === moveId;
  if (!listed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const dealerId = dealerIdFromSession(order.sessionId);
  const partnerId = dealerId ? (await getDealer(dealerId))?.odooPartnerId ?? null : partnerIdFromSession(order.sessionId);
  if (!partnerId) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const pdf = await fetchInvoicePdf(moveId, [partnerId]);
    if (!pdf.ok) {
      const message = pdf.reason === 'no-pdf' ? 'ยังไม่มีไฟล์ PDF ของใบแจ้งหนี้นี้ใน Odoo (บัญชียังไม่ได้พิมพ์/ส่ง) กดขอใบกำกับภาษีในหน้าออเดอร์ได้' : 'ไม่พบใบแจ้งหนี้นี้';
      return NextResponse.redirect(new URL(`/shop/orders/${id}?error=${encodeURIComponent(message)}`, _request.url));
    }
    return new NextResponse(new Uint8Array(pdf.bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(pdf.name)}"`, 'Cache-Control': 'private, max-age=600' } });
  } catch (error) {
    log.error('fetch failed', { moveId, error });
    return NextResponse.redirect(new URL(`/shop/orders/${id}?error=${encodeURIComponent('ดึงใบแจ้งหนี้จาก Odoo ไม่ได้ชั่วคราว ลองใหม่อีกครั้ง')}`, _request.url));
  }
}
