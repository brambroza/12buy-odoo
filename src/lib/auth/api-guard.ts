import { NextResponse } from 'next/server';
import { getCurrentUser } from './session';
import { isBackofficeRole, type Role } from './roles';

/**
 * Route-handler guard for back-office APIs. Returns a 401/403 response to send
 * back, or null when the caller is signed-in back-office staff.
 */
export async function denyUnlessBackoffice(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isBackofficeRole(user.role as Role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}
