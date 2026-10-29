import { vatLabel } from '@/lib/shop/pricing';
import Link from 'next/link';
import { baht, defaultQty } from '@/lib/shop/catalog';
import type { CatalogProduct } from '@/lib/shop/types';
import { StockBadge } from './stock-badge';
import { AddToCart } from './add-to-cart';

/** One catalog row: image, size, name, dealer price, stock, add-to-cart. */
export function ProductCard({ product, price }: { product: CatalogProduct; price: number }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <Link href={`/shop/product/${product.id}`} className="shrink-0">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="size-20 rounded-lg bg-muted object-cover" loading="lazy" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">ไม่มีรูป</div>
        )}
      </Link>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Link href={`/shop/product/${product.id}`} className="block">
          <div className="flex items-center gap-2">
            {product.size && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{product.size.label}</span>}
            <span className="text-xs text-muted-foreground">{product.brand}</span>
          </div>
          <p className="truncate text-sm font-medium">{product.name}</p>
        </Link>
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-bold">{baht(price)} <span className="text-xs font-normal text-muted-foreground">/{product.baseUnit}{vatLabel(product) && ` · ${vatLabel(product)}`}</span></p>
          <StockBadge qty={product.qtyAvailable} />
        </div>
        <AddToCart productId={product.id} defaultQty={defaultQty(product.dealerType)} units={product.units} soldOut={product.qtyAvailable <= 0} compact />
      </div>
    </div>
  );
}
