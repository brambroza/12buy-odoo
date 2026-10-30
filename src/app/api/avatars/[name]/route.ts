import { NextResponse } from 'next/server';
import { readAvatar } from '@/lib/shop/uploads';
import { getCurrentUser } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';

/**
 * Serves profile pictures (dealer shops and staff) to back-office staff; other users see only their
 * own picture and their dealer's.
 * File names are strictly validated in `readAvatar`; a new upload gets a new name, so cache long.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  if (!isBackofficeRole(user.role as Role) && user.dealer?.avatarFile !== name && user.avatarFile !== name) return new NextResponse('not found', { status: 404 });
  const image = await readAvatar(name);
  if (!image) return new NextResponse('not found', { status: 404 });
  return new NextResponse(new Uint8Array(image.body), { headers: { 'Content-Type': image.contentType, 'Cache-Control': 'private, max-age=86400, immutable' } });
}
