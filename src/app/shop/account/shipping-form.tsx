'use client';

import { useActionState, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiAddressFields } from '@/components/shop/thai-address-fields';
import type { ThaiAddress } from '@/lib/thai-address';
import { updateShippingAction, type ShippingResult } from '../actions';

/** Shows the shop's delivery address/phone with an inline edit form for dealer users. */
export function ShippingForm({ address, shipping, phone }: { address: string; shipping: ThaiAddress | null; phone: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<ShippingResult, FormData>(async (prev, formData) => {
    const result = await updateShippingAction(prev, formData);
    if (result?.ok) setEditing(false);
    return result;
  }, null);

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">ที่อยู่</dt><dd>{address || <span className="text-muted-foreground">ยังไม่ระบุ</span>}</dd>
            <dt className="text-muted-foreground">โทร</dt><dd>{phone || <span className="text-muted-foreground">ยังไม่ระบุ</span>}</dd>
          </dl>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} className="self-start"><Pencil className="size-3.5" /> แก้ไข</Button>
        </div>
        {state?.ok && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{state.message}</p>}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <ThaiAddressFields defaultValue={shipping} legacyText={shipping ? undefined : address} />
      <label className="block sm:max-w-xs">
        <span className="text-xs text-muted-foreground">เบอร์ติดต่อรับสินค้า</span>
        <Input name="phone" type="tel" inputMode="tel" defaultValue={phone} maxLength={30} placeholder="0812345678" className="mt-1" autoComplete="tel" />
      </label>
      {state?.ok === false && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>ยกเลิก</Button>
      </div>
    </form>
  );
}
