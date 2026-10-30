import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { ProductCard } from '@/components/shop/product-card';
import { findProduct, getCatalog } from '@/lib/shop/catalog';
import { canSeeProduct, getDealerProfile } from '@/lib/shop/dealer';
import { resolvePrice } from '@/lib/shop/pricing';
import { getSessionId } from '@/lib/shop/session';
import { getFavorites } from '@/lib/shop/store';
import type { CatalogProduct } from '@/lib/shop/types';

export const metadata: Metadata = { title: 'รายการโปรด' };

/** Products the shop hearted, newest first; hidden ones (no longer sold / not allowed) are skipped. */
export default async function FavoritesPage() {
  const [profile, catalog, sid] = await Promise.all([getDealerProfile(), getCatalog(), getSessionId()]);
  const ids = await getFavorites(sid);
  const products = ids.map((id) => findProduct(catalog, id)).filter((p): p is CatalogProduct => Boolean(p) && canSeeProduct(profile, p!));
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-bold"><Heart className="size-5 fill-primary text-primary" /> รายการโปรด <span className="text-sm font-normal text-muted-foreground">{products.length} รายการ</span></h1>
      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีสินค้าในรายการโปรด กดรูปหัวใจบนสินค้าที่สั่งประจำ แล้วกลับมาสั่งได้เร็วขึ้น <Link href="/shop/search" className="text-primary underline">ไปค้นหา</Link></p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => <ProductCard key={product.id} product={product} price={resolvePrice(catalog, product, profile)} favorite />)}
        </div>
      )}
    </div>
  );
}
