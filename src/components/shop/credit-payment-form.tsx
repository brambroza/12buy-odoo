'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SlipField } from '@/components/shop/slip-upload';

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full md:w-auto" disabled={!ready || pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
      {pending ? 'กำลังส่ง...' : ready ? 'แจ้งโอนชำระ' : 'แนบสลิปก่อน'}
    </Button>
  );
}

/**
 * Dealer reports a transfer against a confirmed credit order: amount (prefilled with what is still owed),
 * the slip picture and an optional remark. Posts to `action` with `orderId`, `amount`, `note`, `slip`.
 */
export function CreditPaymentForm({ orderId, outstanding, action }: { orderId: string; outstanding: number; action: (formData: FormData) => Promise<void> }) {
  const [hasSlip, setHasSlip] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">ยอดที่โอน (บาท)</span>
          <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required defaultValue={outstanding > 0 ? outstanding.toFixed(2) : ''} className="h-11 text-base" />
          <span className="mt-1 block text-xs text-muted-foreground">โอนบางส่วนได้ แก้ยอดให้ตรงกับสลิป</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">หมายเหตุ (ถ้ามี)</span>
          <Input name="note" maxLength={300} placeholder="เช่น ชำระงวดแรก / โอนจากบัญชี..." className="h-11 text-base" />
        </label>
      </div>
      <SlipField onChange={setHasSlip} />
      <SubmitButton ready={hasSlip} />
    </form>
  );
}
