import Link from 'next/link';
import { Lock } from 'lucide-react';
import { STOCK_LABELS, type PublicProduct } from '@/lib/shop/public-catalog';

const STOCK_CLASS = { IN_STOCK: 'bg-emerald-500/15 text-emerald-700', LOW: 'bg-amber-500/15 text-amber-700', BACKORDER: 'bg-[var(--lp-bg-2)] text-[var(--lp-muted)]' } as const;

/** Catalog card for visitors: no price, a login nudge instead. */
export function PublicProductCard({ product }: { product: PublicProduct }) {
  const detail = `/tires/${product.id}`;
  return (
    <article className="flex gap-3 rounded-2xl border border-[var(--lp-line)] bg-white p-3">
      <Link href={detail} className="shrink-0">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} width={80} height={80} className="size-20 rounded-xl bg-[var(--lp-bg-2)] object-cover" loading="lazy" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-xl bg-[var(--lp-bg-2)] text-xs text-[var(--lp-muted)]">ไม่มีรูป</div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={detail} className="block">
          <div className="flex flex-wrap items-center gap-1.5">
            {product.size && <span className="rounded-md bg-[var(--lp-accent-soft)] px-1.5 py-0.5 font-mono text-xs font-bold text-[var(--lp-accent)]">{product.size.label}</span>}
            <span className="text-xs text-[var(--lp-muted)]">{product.brandName} · {product.typeLabel}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold">{product.name}</h3>
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STOCK_CLASS[product.stock]}`}>{STOCK_LABELS[product.stock]}</span>
          <Link href={`/login?next=${encodeURIComponent(`/shop/product/${product.id}`)}`} className="inline-flex items-center gap-1 rounded-full bg-[var(--lp-accent)] px-3 py-1.5 text-xs font-bold text-[var(--lp-accent-fg)] hover:brightness-110">
            <Lock className="size-3" aria-hidden="true" /> ดูราคาดีลเลอร์
          </Link>
        </div>
      </div>
    </article>
  );
}
