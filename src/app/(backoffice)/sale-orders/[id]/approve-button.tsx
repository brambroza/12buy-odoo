'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ApproveButton({ orderId, disabled }: { orderId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function approve() {
    setLoading(true);
    try {
      const response = await fetch(`/api/sale-orders/${orderId}/approve`, { method: 'POST' });
      const json = await response.json();
      if (!response.ok) {
        toast.error(json.message ?? 'Approve ไม่สำเร็จ', { description: json.error });
        return;
      }
      toast.success('Approve และ sync เข้า Odoo สำเร็จ');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={approve} disabled={disabled || loading}>
      <CheckCircle2 className="size-4" />
      {loading ? 'กำลัง sync...' : disabled ? 'Synced แล้ว' : 'Approve & Sync'}
    </Button>
  );
}
