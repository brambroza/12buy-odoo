'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { quickOrderAction, type QuickOrderResult } from '@/app/shop/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const EXAMPLE = '195/65R15 4\n215/70R15C 2\n11R22.5 6\n100/80-14 2มัด5';

/** Multi-line quick order input with per-line resolution feedback. */
export function QuickOrderForm() {
  const [result, action, pending] = useActionState<QuickOrderResult | null, FormData>(quickOrderAction, null);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <Textarea name="lines" rows={8} placeholder={EXAMPLE} className="font-mono text-base" required />
        <Button type="submit" disabled={pending} className="w-full" size="lg">{pending ? 'กำลังจับคู่สินค้า...' : 'ใส่ตะกร้าทั้งหมด'}</Button>
      </form>

      {result && (
        <div className="space-y-3">
          {result.added.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">ใส่ตะกร้าแล้ว {result.added.length} รายการ</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {result.added.map((a, i) => <li key={i}><span className="font-mono">{a.line}</span> → {a.name} × {a.unit ? `${a.unit} (${a.qty})` : a.qty}</li>)}
              </ul>
              <Button nativeButton={false} render={<Link href="/shop/cart" />} size="sm" className="mt-2">ไปที่ตะกร้า</Button>
            </div>
          )}
          {result.unresolved.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p className="font-semibold text-amber-700 dark:text-amber-400">หาไม่เจอ {result.unresolved.length} บรรทัด</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {result.unresolved.map((u, i) => <li key={i}><span className="font-mono">{u.line}</span> — {u.reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
