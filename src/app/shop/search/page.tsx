import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpDown, Heart } from 'lucide-react';
import { SizeSearch } from '@/components/shop/size-search';
import { ProductCard } from '@/components/shop/product-card';
import { getCatalog, searchProducts } from '@/lib/shop/catalog';
import { resolvePrice } from '@/lib/shop/pricing';
import { getDealerProfile, visibilityScope } from '@/lib/shop/dealer';
import { getSessionId } from '@/lib/shop/session';
import { SORT_OPTIONS, parsePriceRange, parseSort, sortPriced } from '@/lib/shop/sort';
import { getFavorites } from '@/lib/shop/store';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { cn } from '@/lib/utils';

type Search = { q?: string; type?: string; brand?: string; sort?: string; min?: string; max?: string; fav?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const { q, type } = await searchParams;
  return { title: q ? `ค้นหา ${q}` : type && type in DEALER_TYPE_LABELS ? DEALER_TYPE_LABELS[type as DealerType] : 'ค้นหาสินค้า' };
}

/** Search results restricted to the dealer's product families and customer group, with sort, price range and favourites. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const [profile, catalog, sid] = await Promise.all([getDealerProfile(), getCatalog(), getSessionId()]);
  const favorites = new Set(await getFavorites(sid));
  const type = profile.types.includes(params.type as DealerType) ? (params.type as DealerType) : undefined;
  const query = params.q?.trim() ?? '';
  const scope = visibilityScope(profile);
  const sort = parseSort(params.sort);
  const range = parsePriceRange(params.min, params.max);
  const onlyFav = params.fav === '1';

  const priced = searchProducts(catalog, { ...scope, query, type, brand: params.brand })
    .map((product) => ({ product, price: resolvePrice(catalog, product, profile) }))
    .filter(({ product, price }) => (range.min === null || price >= range.min) && (range.max === null || price <= range.max) && (!onlyFav || favorites.has(product.id)));
  const results = sortPriced(priced, sort);

  const brands = [...new Set(searchProducts(catalog, { ...scope, query, type }).map((r) => r.brand))].sort();
  const href = (next: Partial<Search>) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: query, type, brand: params.brand, sort: params.sort, min: params.min, max: params.max, fav: params.fav, ...next })) if (value) sp.set(key, value);
    return `/shop/search?${sp.toString()}`;
  };
  const chip = (active: boolean) => cn('shrink-0 rounded-full border px-3 py-1 text-xs', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card');

  return (
    <div className="space-y-4">
      <div className="md:max-w-2xl"><SizeSearch initial={query} autoFocus={!query && !type} /></div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <Link href={href({ type: undefined })} className={chip(!type)}>ทุกประเภท</Link>
        {profile.types.map((t) => (
          <Link key={t} href={href({ type: t })} className={chip(type === t)}>{DEALER_TYPE_LABELS[t]}</Link>
        ))}
        <Link href={href({ fav: onlyFav ? undefined : '1' })} className={cn(chip(onlyFav), 'inline-flex items-center gap-1')}><Heart className={cn('size-3', onlyFav && 'fill-current')} /> รายการโปรด{favorites.size ? ` ${favorites.size}` : ''}</Link>
      </div>
      {brands.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Link href={href({ brand: undefined })} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', !params.brand ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}>ทุกยี่ห้อ</Link>
          {brands.map((b) => (
            <Link key={b} href={href({ brand: b })} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', params.brand === b ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}>{b}</Link>
          ))}
        </div>
      )}

      <form action="/shop/search" className="flex flex-wrap items-center gap-2 text-xs">
        {query && <input type="hidden" name="q" value={query} />}
        {type && <input type="hidden" name="type" value={type} />}
        {params.brand && <input type="hidden" name="brand" value={params.brand} />}
        {onlyFav && <input type="hidden" name="fav" value="1" />}
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
          <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="sr-only">เรียงตาม</span>
          <select name="sort" defaultValue={sort} className="bg-transparent text-xs outline-none" aria-label="เรียงตาม">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5">ราคา
          <input name="min" inputMode="numeric" defaultValue={params.min ?? ''} placeholder="ต่ำสุด" aria-label="ราคาต่ำสุด" className="w-16 bg-transparent text-right outline-none" />
          –
          <input name="max" inputMode="numeric" defaultValue={params.max ?? ''} placeholder="สูงสุด" aria-label="ราคาสูงสุด" className="w-16 bg-transparent text-right outline-none" />
        </label>
        <button type="submit" className="rounded-lg border border-border bg-card px-3 py-1.5 font-medium hover:bg-muted">ใช้ตัวกรอง</button>
        {(params.sort || params.min || params.max) && <Link href={href({ sort: undefined, min: undefined, max: undefined })} className="text-muted-foreground underline">ล้างตัวกรอง</Link>}
      </form>

      <p className="text-xs text-muted-foreground">
        {onlyFav ? <>รายการโปรด </> : query ? <>ผลค้นหา “{query}” </> : type ? <>{DEALER_TYPE_LABELS[type]} </> : <>สินค้าทั้งหมด </>}
        {results.length} รายการ · {SORT_OPTIONS.find((o) => o.key === sort)?.label} · ราคาของร้านคุณ
      </p>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {onlyFav ? <>ยังไม่มีสินค้าในรายการโปรด กดรูปหัวใจบนสินค้าเพื่อเก็บไว้สั่งครั้งหน้า</> : range.min !== null || range.max !== null ? <>ไม่มีสินค้าในช่วงราคานี้ <Link href={href({ min: undefined, max: undefined })} className="text-primary underline">ล้างช่วงราคา</Link></> : <>
            ไม่พบขนาดนี้ในประเภทที่ร้านคุณสั่งได้
            <br />ลองพิมพ์เฉพาะตัวเลข เช่น <span className="font-mono">19565</span> หรือขอบล้อ <span className="font-mono">R15</span>
          </>}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {results.map(({ product, price }) => <ProductCard key={product.id} product={product} price={price} favorite={favorites.has(product.id)} />)}
        </div>
      )}
    </div>
  );
}
