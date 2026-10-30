'use client';

import { ErrorState } from '@/components/system/error-state';

/** Back-office boundary: keeps the sidebar, swaps the page body for the error card. */
export default function BackofficeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} homeHref="/admin" homeLabel="แดชบอร์ด" hint="โหลดข้อมูลหน้านี้ไม่สำเร็จ (มักเกิดจาก Odoo ตอบช้า) ลองอีกครั้ง หรือตรวจการเชื่อมต่อที่ ตั้งค่าเชื่อมต่อ Odoo" />;
}
