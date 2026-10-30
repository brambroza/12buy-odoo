'use client';

import { ErrorState } from '@/components/system/error-state';

/** Shop pages fail mostly when Odoo (catalog / stock) is unreachable; say so and offer a retry. */
export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} homeHref="/shop" homeLabel="หน้าแรกร้านค้า" hint="ดึงข้อมูลสินค้าหรือออเดอร์ไม่ได้ชั่วคราว ลองใหม่อีกครั้งในอีกสักครู่ ตะกร้าและออเดอร์ของร้านยังอยู่ครบ" />;
}
