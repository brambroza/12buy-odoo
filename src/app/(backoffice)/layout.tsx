import { requireBackoffice } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { BackofficeShell } from '@/components/backoffice-shell';
import { SIDEBAR_COOKIE } from '@/lib/backoffice-ui';

export const dynamic = 'force-dynamic';

/** Every back-office route requires a staff session; the sidebar shows who is signed in. */
export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const [user, cookieStore] = await Promise.all([requireBackoffice(), cookies()]);
  return <BackofficeShell user={{ name: user.name, role: user.role }} sidebarOpen={cookieStore.get(SIDEBAR_COOKIE)?.value !== '0'}>{children}</BackofficeShell>;
}
