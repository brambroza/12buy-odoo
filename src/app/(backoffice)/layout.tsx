import { requireBackoffice } from '@/lib/auth/session';
import { BackofficeShell } from '@/components/backoffice-shell';

export const dynamic = 'force-dynamic';

/** Every back-office route requires a staff session; the sidebar shows who is signed in. */
export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBackoffice();
  return <BackofficeShell user={{ name: user.name, role: user.role }}>{children}</BackofficeShell>;
}
