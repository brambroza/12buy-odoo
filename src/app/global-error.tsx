'use client';

import { ErrorState } from '@/components/system/error-state';
import './globals.css';

/** Last-resort boundary when the root layout itself fails; must render its own html/body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body className="landing flex min-h-screen items-center px-4">
        <ErrorState error={error} reset={reset} theme="landing" />
      </body>
    </html>
  );
}
