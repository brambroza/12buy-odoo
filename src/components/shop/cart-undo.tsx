'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/** What a cart line needs to be put back after "ลบ". `qty` is in base units. */
export type RemovedLine = { productId: number; qty: number; unitId: number | null; unitQty: number | null; index: number; label: string };

const EVENT = 'cart:removed';
const UNDO_MS = 5000;

/**
 * Last removal, kept so a toast that mounts after the event (removing the last line swaps the
 * page to the empty-cart view) can still offer undo.
 */
let lastRemoved: { line: RemovedLine; at: number } | null = null;

/** Tells the undo toast that a line was removed (called by the stepper right before it deletes). */
export function announceRemoved(line: RemovedLine) {
  lastRemoved = { line, at: Date.now() };
  window.dispatchEvent(new CustomEvent<RemovedLine>(EVENT, { detail: line }));
}

function recentRemoval(): RemovedLine | null {
  return lastRemoved && Date.now() - lastRemoved.at < UNDO_MS ? lastRemoved.line : null;
}

/**
 * "ลบ … แล้ว · เลิกทำ" toast shown for 5 seconds after a line is removed.
 * Lives outside the line list so it survives the line unmounting after the server refresh.
 */
export function CartUndoToast({ restore }: { restore: (formData: FormData) => Promise<void> }) {
  const [line, setLine] = useState<RemovedLine | null>(recentRemoval);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onRemoved = (e: Event) => {
      setLine((e as CustomEvent<RemovedLine>).detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLine(null), UNDO_MS);
    };
    window.addEventListener(EVENT, onRemoved);
    if (lastRemoved) timer.current = setTimeout(() => setLine(null), Math.max(0, UNDO_MS - (Date.now() - lastRemoved.at)));
    return () => {
      window.removeEventListener(EVENT, onRemoved);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!line) return null;

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    lastRemoved = null;
    const formData = new FormData();
    formData.set('productId', String(line.productId));
    formData.set('qty', String(line.qty));
    if (line.unitId != null) formData.set('unitId', String(line.unitId));
    if (line.unitQty != null) formData.set('unitQty', String(line.unitQty));
    formData.set('index', String(line.index));
    startTransition(async () => {
      await restore(formData);
      setLine(null);
    });
  };

  return (
    <div role="status" className="fixed inset-x-3 bottom-40 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg lg:bottom-6">
      <span className="min-w-0 truncate">ลบ {line.label} แล้ว</span>
      <button type="button" onClick={undo} disabled={pending} className="shrink-0 font-bold underline underline-offset-2 disabled:opacity-60">
        {pending ? 'กำลังคืน...' : 'เลิกทำ'}
      </button>
    </div>
  );
}

/** "ล้าง" button that asks before emptying the whole cart. */
export function ClearCartButton({ count, action }: { count: number; action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={pending}><Trash2 className="size-4" /> ล้างตะกร้า</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ล้างตะกร้าทั้งหมด?</AlertDialogTitle>
          <AlertDialogDescription>สินค้า {count} รายการจะถูกลบออกจากตะกร้า</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ไม่ล้าง</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => startTransition(() => action())}>ล้างตะกร้า</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
