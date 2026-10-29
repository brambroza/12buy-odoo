import Link from 'next/link';
import { SizeSearch } from '@/components/shop/size-search';
import { ProductCard } from '@/components/shop/product-card';
import { getCatalog, searchProducts } from '@/lib/shop/catalog';
import { resolvePrice } from '@/lib/shop/pricing';
import { getDealerProfile, visibilityScope } from '@/lib/shop/dealer';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { cn } from '@/lib/utils';

type Search = { q?: string; type?: string; brand?: string };

/** Search results restricted to the dealer's product families and customer group, cheapest first. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const profile = await getDealerProfile();
  const catalog = await getCatalog();
  const type = profile.types.includes(params.type as DealerType) ? (params.type as DealerType) : undefined;
  const query = params.q?.trim() ?? '';
  const scope = visibilityScope(profile);

  const results = searchProducts(catalog, { ...scope, query, type, brand: params.brand })
    .map((product) => ({ product, price: resolvePrice(catalog, product, profile) }))
    .sort((a, b) => a.price - b.price || (a.product.size?.label ?? '').localeCompare(b.product.size?.label ?? ''));

  const brands = [...new Set(searchProducts(catalog, { ...scope, query, type }).map((r) => r.brand))].sort();
  const href = (next: Partial<Search>) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: query, type, brand: params.brand, ...next })) if (value) sp.set(key, value);
    return `/shop/search?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="md:max-w-2xl"><SizeSearch initial={query} autoFocus={!query && !type} /></div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <Link href={href({ type: undefined })} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', !type ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>ทุกประเภท</Link>
        {profile.types.map((t) => (
          <Link key={t} href={href({ type: t })} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', type === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{DEALER_TYPE_LABELS[t]}</Link>
        ))}
      </div>
      {brands.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Link href={href({ brand: undefined })} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', !params.brand ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}>ทุกยี่ห้อ</Link>
          {brands.map((b) => (
            <Link key={b} href={href({ brand: b })} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', params.brand === b ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}>{b}</Link>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {query ? <>ผลค้นหา “{query}” </> : type ? <>{DEALER_TYPE_LABELS[type]} </> : <>สินค้าทั้งหมด </>}
        {results.length} รายการ · เรียงราคาถูกไปแพง · ราคาของร้านคุณ
      </p>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          ไม่พบขนาดนี้ในประเภทที่ร้านคุณสั่งได้
          <br />ลองพิมพ์เฉพาะตัวเลข เช่น <span className="font-mono">19565</span> หรือขอบล้อ <span className="font-mono">R15</span>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {results.map(({ product, price }) => <ProductCard key={product.id} product={product} price={price} />)}
        </div>
      )}
    </div>
  );
}
