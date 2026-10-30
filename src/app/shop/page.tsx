import Link from 'next/link';
import { ChevronRight, Clock, Heart, RotateCcw } from 'lucide-react';
import { SizeSearch } from '@/components/shop/size-search';
import { ProductCard } from '@/components/shop/product-card';
import { Button } from '@/components/ui/button';
import { baht, findProduct, getCatalog } from '@/lib/shop/catalog';
import { resolvePrice } from '@/lib/shop/pricing';
import { canSeeProduct, getDealerProfile } from '@/lib/shop/dealer';
import { getSessionId } from '@/lib/shop/session';
import { getFavorites, listOrders } from '@/lib/shop/store';
import { getRecentlyViewed } from '@/lib/shop/recent';
import { DEALER_TYPE_LABELS, ORDER_STATUS_LABELS, type CatalogProduct } from '@/lib/shop/types';
import { reorderAction } from './actions';

/** Dealer home: size search, reorder, frequently bought, recent orders. */
export default async function ShopHome() {
  const [profile, sid] = await Promise.all([getDealerProfile(), getSessionId()]);
  let catalog: Awaited<ReturnType<typeof getCatalog>> | null = null;
  let loadError: string | null = null;
  try {
    catalog = await getCatalog();
  } catch (error) {
    console.error('[shop] catalog load failed', error);
    loadError = 'โหลดรายการสินค้าไม่สำเร็จ';
  }
  const [allOrders, favoriteIds, recentIds] = await Promise.all([listOrders(sid), getFavorites(sid), getRecentlyViewed()]);
  const orders = allOrders.filter((o) => o.status !== 'CANCELLED');
  const lastOrder = orders[0];
  const visible = (ids: number[], limit: number): CatalogProduct[] => catalog ? ids.map((id) => findProduct(catalog!, id)).filter((p): p is CatalogProduct => Boolean(p) && canSeeProduct(profile, p!)).slice(0, limit) : [];
  const favorites = visible(favoriteIds, 4);
  const recent = visible(recentIds.filter((id) => !favoriteIds.includes(id)), 4);
  const favoriteSet = new Set(favoriteIds);

  const frequency = new Map<number, number>();
  for (const order of orders) for (const line of order.lines) frequency.set(line.productId, (frequency.get(line.productId) ?? 0) + line.qty);
  const frequent: CatalogProduct[] = catalog
    ? [...frequency.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => findProduct(catalog!, id)).filter((p): p is CatalogProduct => Boolean(p) && canSeeProduct(profile, p!)).slice(0, 4)
    : [];

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-xl font-bold md:text-2xl">วันนี้สั่งยางขนาดไหน?</h1>
        <SizeSearch autoFocus />
        <div className="flex flex-wrap gap-2">
          {profile.types.map((type) => (
            <Link key={type} href={`/shop/search?type=${type}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              {DEALER_TYPE_LABELS[type]}
            </Link>
          ))}
        </div>
      </section>

      {loadError && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{loadError} กรุณาลองใหม่อีกครั้ง หรือติดต่อฝ่ายขายทาง LINE</p>
      )}

      {catalog && frequent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">สินค้าที่สั่งบ่อย</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {frequent.map((product) => <ProductCard key={product.id} product={product} price={resolvePrice(catalog!, product, profile)} favorite={favoriteSet.has(product.id)} />)}
          </div>
        </section>
      )}

      {catalog && favorites.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Heart className="size-4 fill-primary text-primary" /> รายการโปรด</h2>
            <Link href="/shop/favorites" className="text-xs text-primary">ดูทั้งหมด ({favoriteIds.length})</Link>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {favorites.map((product) => <ProductCard key={product.id} product={product} price={resolvePrice(catalog!, product, profile)} favorite />)}
          </div>
        </section>
      )}

      {catalog && recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="size-4 text-muted-foreground" /> ดูล่าสุด</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {recent.map((product) => <ProductCard key={product.id} product={product} price={resolvePrice(catalog!, product, profile)} favorite={favoriteSet.has(product.id)} />)}
          </div>
        </section>
      )}
      </div>

      <aside className="space-y-6">
      {lastOrder && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">สั่งเหมือนครั้งก่อน</p>
              <p className="text-xs text-muted-foreground">{lastOrder.ref} · {lastOrder.lines.length} รายการ · {baht(lastOrder.total)}</p>
            </div>
            <form action={reorderAction}>
              <input type="hidden" name="orderId" value={lastOrder.id} />
              <Button type="submit" size="sm"><RotateCcw className="size-4" /> สั่งซ้ำ</Button>
            </form>
          </div>
          <ul className="mt-2 text-xs text-muted-foreground">
            {lastOrder.lines.slice(0, 3).map((line) => <li key={line.productId}>{line.size ?? line.code} × {line.qty}</li>)}
            {lastOrder.lines.length > 3 && <li>และอีก {lastOrder.lines.length - 3} รายการ</li>}
          </ul>
        </section>
      )}

      {orders.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">ออเดอร์ล่าสุด</h2>
            <Link href="/shop/orders" className="text-xs text-primary">ดูทั้งหมด</Link>
          </div>
          {orders.slice(0, 3).map((order) => (
            <Link key={order.id} href={`/shop/orders/${order.id}`} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
              <span>
                <span className="font-medium">{order.ref}</span>
                <span className="block text-xs text-muted-foreground">{ORDER_STATUS_LABELS[order.status]} · {baht(order.total)}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      )}

      {!lastOrder && catalog && (
        <section className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          ยังไม่มีออเดอร์ ลองพิมพ์ขนาดยางด้านบน หรือไปที่ <Link href="/shop/quick" className="text-primary">สั่งเร็ว</Link> เพื่อวางรายการหลายบรรทัด
        </section>
      )}
      </aside>
    </div>
  );
}
