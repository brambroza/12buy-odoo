import { NotFoundState } from '@/components/system/not-found-state';

/** 404 inside the dealer shop shell (unknown product, order of another shop, ...). */
export default function ShopNotFound() {
  return <NotFoundState title="ไม่พบสินค้าหรือออเดอร์นี้" hint="สินค้าอาจถูกปิดการขาย หรือออเดอร์ไม่ได้อยู่ในร้านของคุณ" homeHref="/shop" homeLabel="หน้าแรกร้านค้า" searchHref="/shop/search" />;
}
