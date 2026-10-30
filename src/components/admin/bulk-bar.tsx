'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Printer, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Action = (formData: FormData) => void | Promise<void>;

/**
 * Appears when orders are ticked (checkboxes with `form="bulk-orders"`): confirm, refresh from Odoo,
 * print picking notes, export the selection. Submits through the hidden `bulk-orders` form so row
 * action forms stay valid HTML.
 */
export function BulkBar({ canConfirm, canPrint, canExport, confirmAction, refreshAction }: { canConfirm: boolean; canPrint: boolean; canExport: boolean; confirmAction: Action; refreshAction: Action }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setIds([...document.querySelectorAll<HTMLInputElement>('input[data-bulk-item]:checked')].map((el) => el.value));
    document.addEventListener('change', read);
    read();
    return () => document.removeEventListener('change', read);
  }, []);
  if (ids.length === 0) return null;
  const clear = () => { document.querySelectorAll<HTMLInputElement>('input[data-bulk-item]:checked').forEach((el) => { el.checked = false; }); setIds([]); };
  const submit = (action: Action, confirmText?: string) => () => {
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData();
    for (const id of ids) fd.append('ids', id);
    void action(fd);
  };
  const joined = ids.join(',');
  return (
    <div role="toolbar" aria-label="จัดการออเดอร์ที่เลือก" className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2 text-sm shadow-sm backdrop-blur">
      <span className="px-1 font-semibold">เลือก {ids.length} ออเดอร์</span>
      {canConfirm && <Button type="button" size="sm" onClick={submit(confirmAction, `ยืนยัน ${ids.length} ออเดอร์ที่พร้อม แล้วสร้าง SO ใน Odoo?`)}><CheckCircle2 /> ยืนยันที่พร้อม</Button>}
      <Button type="button" size="sm" variant="outline" onClick={submit(refreshAction)}><RefreshCw /> ดึงสถานะที่เลือก</Button>
      {canPrint && <Button nativeButton={false} render={<a href={`/admin/orders/picking?ids=${joined}`} target="_blank" rel="noreferrer" />} size="sm" variant="outline"><Printer /> พิมพ์ใบจัดของ</Button>}
      {canExport && <Button nativeButton={false} render={<a href={`/api/admin/export/orders?ids=${joined}&format=xlsx`} />} size="sm" variant="outline"><Download /> Excel</Button>}
      <Button type="button" size="sm" variant="ghost" onClick={clear} className="ml-auto"><X /> ล้าง</Button>
    </div>
  );
}
