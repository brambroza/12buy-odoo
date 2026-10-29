import { NextResponse } from 'next/server';
import { readSlip } from '@/lib/shop/uploads';
import { getCurrentUser } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import { dealerScopeKey } from '@/lib/shop/dealer';
import * as store from '@/lib/shop/store';

/**
 * Serves prototype slip images to back-office staff, or to the dealer whose order
 * the slip is attached to. File names are strictly validated in `readSlip`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  if (!isBackofficeRole(user.role as Role)) {
    const scope = await dealerScopeKey();
    const order = scope ? await store.getOrder(scope, name.split('-')[0]) : undefined;
    if (order?.payment.slipFile !== name) return new NextResponse('not found', { status: 404 });
  }
  const slip = await readSlip(name);
  if (!slip) return new NextResponse('not found', { status: 404 });
  return new NextResponse(new Uint8Array(slip.body), { headers: { 'Content-Type': slip.contentType, 'Cache-Control': 'private, max-age=3600' } });
}
