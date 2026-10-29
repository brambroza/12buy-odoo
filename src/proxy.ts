import { NextResponse, type NextRequest } from 'next/server';

/** Paths that need a signed-in user. Full role checks happen in the route layouts. */
const PROTECTED = ['/shop', '/admin', '/dashboard', '/sale-orders', '/customers', '/products', '/account'];
const SESSION_COOKIE = 'sid';

/**
 * Edge gate: bounce visitors without a session cookie straight to login with a
 * `next` parameter. Cheap presence check only; the server validates the session.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/shop/:path*', '/admin/:path*', '/dashboard/:path*', '/sale-orders/:path*', '/customers/:path*', '/products/:path*', '/account/:path*'],
};
