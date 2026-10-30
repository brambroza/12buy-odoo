import { NextResponse } from 'next/server';
import { loadBell } from '@/lib/admin/notifications';
import { getCurrentUser } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/** Notification bell data for the signed-in staff member; polled by the back-office top bar. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isBackofficeRole(user.role as Role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(await loadBell(user.role as Role), { headers: { 'Cache-Control': 'no-store' } });
}
