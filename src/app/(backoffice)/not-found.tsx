import { NotFoundState } from '@/components/system/not-found-state';

export default function BackofficeNotFound() {
  return <NotFoundState hint="ไม่มีหน้านี้ในหลังบ้าน หรือรายการที่เปิดถูกลบไปแล้ว" homeHref="/admin" homeLabel="แดชบอร์ด" />;
}
