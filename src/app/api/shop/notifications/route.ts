import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { countUnread, listNotifications } from '@/lib/notify/repo';

export const dynamic = 'force-dynamic';

/** Dealer bell: unread count + the latest few notifications of the shop. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.dealerId) return NextResponse.json({ unread: 0, items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const scope = { dealerId: user.dealerId };
  const [unread, items] = await Promise.all([countUnread(scope), listNotifications(scope, 8)]);
  return NextResponse.json({ unread, items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, readAt: n.readAt, createdAt: n.createdAt })) }, { headers: { 'Cache-Control': 'no-store' } });
}
