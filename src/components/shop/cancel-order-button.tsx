'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

/** "ยกเลิกออเดอร์" button that asks before cancelling, so a stray tap cannot cancel a real order. */
export function CancelOrderButton({ orderId, orderRef, action }: { orderId: string; orderRef: string; action: (formData: FormData) => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const cancel = () => {
    const formData = new FormData();
    formData.set('orderId', orderId);
    startTransition(() => action(formData));
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" className="h-11 text-destructive" disabled={pending}>{pending ? 'กำลังยกเลิก...' : 'ยกเลิกออเดอร์'}</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ยกเลิกออเดอร์ {orderRef}?</AlertDialogTitle>
          <AlertDialogDescription>ยกเลิกแล้วกู้คืนไม่ได้ ถ้าต้องการสินค้าเดิมให้กด “สั่งซ้ำ” เพื่อสร้างออเดอร์ใหม่</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ไม่ยกเลิก</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={cancel}>ยืนยันยกเลิก</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
