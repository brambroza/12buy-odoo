import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PriceBox } from '@/components/shop/price-box';
import { StockBadge } from '@/components/shop/stock-badge';
import { FavoriteButton } from '@/components/shop/favorite-button';
import { ProductImage } from '@/components/shop/product-image';
import { RecentlyViewedTracker } from '@/components/shop/recently-viewed-tracker';
import { getSessionId } from '@/lib/shop/session';
import { getFavorites } from '@/lib/shop/store';
import { baht, defaultQty, findProduct, getCatalog } from '@/lib/shop/catalog';
import { cashDiscountPerUnit, cashRuleOf, resolvePrice, vatLabel } from '@/lib/shop/pricing';
import { canSeeProduct, getDealerProfile } from '@/lib/shop/dealer';
import { DEALER_TYPE_LABELS } from '@/lib/shop/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const product = findProduct(await getCatalog(), Number(id));
    return { title: product ? `${product.size?.label ? `${product.size.label} ` : ''}${product.name}` : 'สินค้า' };
  } catch {
    return { title: 'สินค้า' };
  }
}

/** Product detail with dealer price and quantity-tier hints. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) notFound();
  const [profile, catalog, sid] = await Promise.all([getDealerProfile(), getCatalog(), getSessionId()]);
  const product = findProduct(catalog, productId);
  if (!product || !canSeeProduct(profile, product)) notFound();
  const favorite = (await getFavorites(sid)).includes(product.id);

  const unit = resolvePrice(catalog, product, profile);
  // Credit dealers see what paying cash takes off one unit (same rule as the cart and checkout).
  const cashOff = cashDiscountPerUnit(catalog, product, profile, 1, unit);
  const cashRule = cashRuleOf(profile, product);
  const cashNote = cashOff > 0 ? `จ่ายเงินสดลด${cashRule?.kind === 'PERCENT' ? ` ${cashRule.value}%` : ''} −${baht(cashOff)} /${product.baseUnit} (หักท้ายบิล)` : '';
  const qty = defaultQty(product.dealerType);
  const sameSize = product.size
    ? catalog.products.filter((p) => p.id !== product.id && p.size?.label === product.size!.label && canSeeProduct(profile, p))
    : [];

  return (
    <div className="space-y-4">
      <Link href="/shop/search" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> กลับไปค้นหา</Link>

      <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-8 md:space-y-0">
      <div className="relative md:sticky md:top-24">
        <ProductImage src={product.imageUrl} alt={product.name} className="aspect-square w-full rounded-2xl" sizes="(min-width: 768px) 50vw, 100vw" priority />
        <FavoriteButton productId={product.id} active={favorite} className="absolute right-3 top-3 size-10" />
      </div>
      <RecentlyViewedTracker productId={product.id} />

      <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{DEALER_TYPE_LABELS[product.dealerType]}</span>·<span>{product.brand}</span>·<span className="font-mono">{product.code}</span>
        </div>
        <h1 className="text-xl font-bold md:text-2xl">{product.name}</h1>
        {product.size && <p className="text-2xl font-black text-primary">{product.size.label}</p>}
      </div>

      <PriceBox productId={product.id} unitPrice={unit} baseUnit={product.baseUnit} units={product.units} defaultQty={qty} stock={<StockBadge qty={product.qtyAvailable} />} soldOut={product.qtyAvailable <= 0} vatNote={vatLabel(product)} cashNote={cashNote} />

      {sameSize.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">ขนาดเดียวกัน ยี่ห้ออื่น</h2>
          {sameSize.map((p) => (
            <Link key={p.id} href={`/shop/product/${p.id}`} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
              <span className="truncate">{p.brand} · {p.name}</span>
              <span className="font-semibold">{baht(resolvePrice(catalog, p, profile))}</span>
            </Link>
          ))}
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
