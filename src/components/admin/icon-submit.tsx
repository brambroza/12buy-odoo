'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Icon-only submit button for row actions. Shows a spinner while its form is pending; with `confirm`
 * it asks first (for destructive actions such as delete or cancel). Put it inside a server-action form.
 */
export function IconSubmit({ label, children, tone = 'default', confirm, disabled, className }: {
  label: string; children: ReactNode; tone?: 'default' | 'primary' | 'danger'; confirm?: string; disabled?: boolean; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={tone === 'primary' ? 'default' : 'ghost'}
      size="icon-sm"
      title={label}
      aria-label={label}
      disabled={disabled || pending}
      className={cn('transition-transform active:scale-90', tone === 'danger' && 'text-destructive hover:bg-destructive/10 hover:text-destructive', className)}
      onClick={(event) => { if (confirm && !window.confirm(confirm)) event.preventDefault(); }}
    >
      {pending ? <Loader2 className="animate-spin" /> : children}
    </Button>
  );
}
