import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth/session';
import { LINE_STATE_COOKIE, lineAuthorizeUrl, makeState } from '@/lib/notify/line-login';
import { getLineConfig } from '@/lib/notify/line-config';
import { absoluteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** Starts the LINE link flow for the signed-in user: sets the state cookie and redirects to LINE. */
export async function GET() {
  const user = await requireUser();
  const { loginChannelSecret } = await getLineConfig();
  const state = makeState(user.id, loginChannelSecret || user.id);
  const url = await lineAuthorizeUrl(state);
  if (!url) return NextResponse.redirect(absoluteUrl('/shop/account?line=unconfigured'));
  const jar = await cookies();
  jar.set(LINE_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/auth/line', maxAge: 600 });
  return NextResponse.redirect(url);
}
