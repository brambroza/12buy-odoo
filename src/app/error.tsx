'use client';

import { ErrorState } from '@/components/system/error-state';

/** Catches render errors on public pages (landing, login, catalog). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="landing flex min-h-screen items-center px-4">
      <ErrorState error={error} reset={reset} theme="landing" />
    </div>
  );
}
