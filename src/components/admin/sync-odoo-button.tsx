'use client';

import { useFormStatus } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** "Sync Odoo" submit button that spins while its server-action form runs. Put it inside the form. */
export function SyncOdooButton({ label = 'Sync Odoo' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending} title="ดึงลูกค้าจาก Odoo ใหม่ และผูกดีลเลอร์ที่ยังไม่ผูกด้วยเลขผู้เสียภาษี">
      <RefreshCw className={cn(pending && 'animate-spin')} /> {pending ? 'กำลัง sync…' : label}
    </Button>
  );
}
