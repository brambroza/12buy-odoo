import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { audit } from '@/lib/auth/audit';
import { getCurrentUser } from '@/lib/auth/session';
import { updateUser } from '@/lib/auth/users';
import { flash } from '@/lib/flash';
import { logger } from '@/lib/logger';
import { LINE_STATE_COOKIE, exchangeCode, verifyState } from '@/lib/notify/line-login';
import { getLineConfig } from '@/lib/notify/line-config';
import { linePush } from '@/lib/notify/line';
import { absoluteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';
const log = logger('line-login');

/** LINE redirects here; verify state, exchange the code, store the LINE user id on the signed-in user. */
export async function GET(request: NextRequest) {
  const back = (query: string) => NextResponse.redirect(absoluteUrl(`/shop/account?${query}`));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(absoluteUrl('/login?next=%2Fshop%2Faccount'));
  const jar = await cookies();
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const code = request.nextUrl.searchParams.get('code');
  const cookieState = jar.get(LINE_STATE_COOKIE)?.value;
  jar.delete(LINE_STATE_COOKIE);
  const { loginChannelSecret } = await getLineConfig();
  if (!code || !cookieState || cookieState !== state || !verifyState(state, user.id, loginChannelSecret || user.id)) {
    log.warn('state mismatch', { userId: user.id });
    return back('line=failed');
  }
  try {
    const profile = await exchangeCode(code);
    await updateUser(user.id, { lineUserId: profile.userId, lineLinkedAt: new Date() });
    await audit(user.id, 'user.line_link', 'User', user.id, { displayName: profile.displayName });
    await linePush(profile.userId, [{ type: 'text', text: `เชื่อม LINE กับบัญชี ${user.name} เรียบร้อย จากนี้จะได้รับแจ้งเตือนสถานะออเดอร์ที่นี่` }]);
    await flash('เชื่อม LINE แล้ว', { icon: 'check', description: `${profile.displayName} · จะได้รับแจ้งเตือนทุกสถานะออเดอร์` });
    return back('line=linked');
  } catch (error) {
    log.error('link failed', { userId: user.id, error });
    return back('line=failed');
  }
}
