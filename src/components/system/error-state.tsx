'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, Home, MessageCircle, RotateCcw } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import { SITE } from '@/lib/seo';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Where "กลับหน้าหลัก" goes. */
  homeHref?: string;
  homeLabel?: string;
  /** Friendly explanation shown under the title. */
  hint?: string;
  /** `landing` uses the red/white public theme variables, `app` the shadcn theme. */
  theme?: 'landing' | 'app';
};

/**
 * Friendly error card used by every `error.tsx`. Reports the error to Sentry (no-op without a DSN),
 * never shows the raw message to the user, and offers retry / home / LINE.
 */
export function ErrorState({ error, reset, homeHref = '/', homeLabel = 'กลับหน้าแรก', hint, theme = 'app' }: Props) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error('[error-boundary]', error);
  }, [error]);
  const lineHref = `https://line.me/R/ti/p/${encodeURIComponent(SITE.lineId)}`;
  const landing = theme === 'landing';
  const card = landing ? 'border-[var(--lp-line)] bg-white text-[var(--lp-fg)]' : 'border-border bg-card text-card-foreground';
  const muted = landing ? 'text-[var(--lp-muted)]' : 'text-muted-foreground';
  const primary = landing ? 'bg-[var(--lp-accent)] text-[var(--lp-accent-fg)] hover:brightness-110' : 'bg-primary text-primary-foreground hover:opacity-90';
  const outline = landing ? 'border-[var(--lp-line)] hover:bg-[var(--lp-accent-soft)]' : 'border-border hover:bg-muted';
  return (
    <div role="alert" className={`mx-auto my-10 w-full max-w-md rounded-2xl border p-6 text-center shadow-sm ${card}`}>
      <div className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-full ${landing ? 'bg-[var(--lp-accent-soft)] text-[var(--lp-accent)]' : 'bg-destructive/10 text-destructive'}`}>
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-extrabold">ขออภัย เกิดข้อผิดพลาดชั่วคราว</h1>
      <p className={`mt-2 text-sm ${muted}`}>{hint ?? 'ระบบบันทึกปัญหานี้ไว้แล้ว ลองโหลดหน้านี้ใหม่อีกครั้ง หากยังไม่ได้ ทัก LINE ให้ทีมงานช่วยได้ทันที'}</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={reset} className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition ${primary}`}>
          <RotateCcw className="size-4" aria-hidden="true" /> ลองอีกครั้ง
        </button>
        <Link href={homeHref} className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition ${outline}`}>
          <Home className="size-4" aria-hidden="true" /> {homeLabel}
        </Link>
        <a href={lineHref} target="_blank" rel="noopener noreferrer" className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition ${outline}`}>
          <MessageCircle className="size-4" aria-hidden="true" /> LINE
        </a>
      </div>
      {error.digest && <p className={`mt-4 text-[11px] ${muted}`}>รหัสอ้างอิง {error.digest}</p>}
    </div>
  );
}
