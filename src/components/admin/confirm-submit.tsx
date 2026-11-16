'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Labelled submit button that asks `confirm` first and can post to its own server action
 * (`formAction`) instead of the form's. Shows a spinner while the form is pending.
 */
export function ConfirmSubmit({ children, confirm, formAction, variant = 'outline', icon }: {
  children: ReactNode;
  confirm: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  icon?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      formAction={formAction}
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => { if (!window.confirm(confirm)) event.preventDefault(); }}
    >
      {pending ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </Button>
  );
}
