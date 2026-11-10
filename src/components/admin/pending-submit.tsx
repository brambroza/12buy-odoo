'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Submit button for slow server actions (Odoo sync, commission calculation). While its form runs it
 * disables itself, swaps the icon for a spinner, shows `pendingLabel` with the elapsed seconds, and pins
 * an indeterminate progress bar plus a status card to the page so the user knows work is still going.
 * Put it inside a server-action form.
 */
export function PendingSubmit({ label, pendingLabel, hint, icon, variant = 'outline', size = 'sm', disabled, title }: {
  label: ReactNode;
  pendingLabel: string;
  hint?: string;
  icon?: ReactNode;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'xs' | 'lg';
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  const seconds = useElapsedSeconds(pending);
  return (
    <>
      <Button type="submit" variant={variant} size={size} disabled={disabled || pending} aria-busy={pending} title={title}>
        {pending ? <Loader2 className="animate-spin" /> : icon}
        {pending ? `${pendingLabel} ${seconds}s` : label}
      </Button>
      {pending && <PendingOverlay message={pendingLabel} hint={hint} seconds={seconds} />}
    </>
  );
}

/** Counts whole seconds since `active` became true; resets to 0 when it turns false. */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => { window.clearInterval(timer); setSeconds(0); };
  }, [active]);
  return seconds;
}

/** Top-of-page indeterminate bar and a bottom-right status card, rendered into document.body. */
function PendingOverlay({ message, hint, seconds }: { message: string; hint?: string; seconds: number }) {
  return createPortal(
    <>
      <div className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary/15" role="progressbar" aria-label={message}>
        <div className="pending-bar h-full w-1/3 rounded-full bg-primary" />
      </div>
      <div className="fixed right-4 bottom-4 z-[100] w-72 rounded-xl border border-border bg-card p-3 text-sm shadow-lg" role="status" aria-live="polite">
        <div className="flex items-center gap-2 font-medium">
          <Loader2 className="size-4 animate-spin text-primary" /> {message}
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{seconds} วินาที</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="pending-bar h-full w-1/3 rounded-full bg-primary" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{hint ?? 'กรุณาอย่าปิดหรือรีเฟรชหน้านี้จนกว่าจะเสร็จ'}</p>
      </div>
    </>,
    document.body,
  );
}
