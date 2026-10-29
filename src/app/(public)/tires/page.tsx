import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SizeSearch } from '@/components/shop/size-search';
import { SEO_SIZES, brandLogo, sizeSlug } from '@/lib/landing-content';
import { listBrands, loadPublicCatalog, parseDealerType, publicSearch } from '@/lib/shop/public-catalog';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { SITE, absoluteUrl, breadcrumbJsonLd } from '@/lib/seo';
import { CatalogUnavailable, Crumbs, PublicResults } from './_shared';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'แคตตาล็อกยางราคาส่งสำหรับดีลเลอร์ ค้นหาตามขนาดและแบรนด์',
  description: `ดูรายการยางรถยนต์ ยางรถบรรทุก ยางมอเตอร์ไซค์ และแบตเตอรี่ทุกแบรนด์ที่ ${SITE.name} จำหน่าย ค้นหาด้วยขนาดยาง ราคาดีลเลอร์แสดงหลังเข้าสู่ระบบ`,
  alternates: { canonical: absoluteUrl('/tires') },
};

const TYPES = Object.entries(DEALER_TYPE_LABELS) as [DealerType, string][];

/** Public catalog home: size search, product families, popular sizes, brands. */
export default async function TiresPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: rawType } = await searchParams;
  const type = parseDealerType(rawType);
  const catalog = await loadPublicCatalog();
  const brands = catalog ? listBrands(catalog, type) : [];
  const featured = catalog && type ? publicSearch(catalog, { type }).slice(0, 12) : [];
  const crumbs = [{ name: 'หน้าแรก', path: '/' }, { name: 'แคตตาล็อก', path: '/tires' }, ...(type ? [{ name: DEALER_TYPE_LABELS[type], path: `/tires?type=${type}` }] : [])];

  return (
    <div id="catalog-top" className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }} />
      <Crumbs crumbs={crumbs} />
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{type ? `${DEALER_TYPE_LABELS[type]}ราคาส่งสำหรับดีลเลอร์` : 'แคตตาล็อกยางและแบตเตอรี่สำหรับดีลเลอร์'}</h1>
        <p className="mt-2 max-w-2xl text-[var(--lp-muted)]">พิมพ์ขนาดยางเพื่อดูทุกแบรนด์ที่มี ราคาของร้านแสดงหลังเข้าสู่ระบบ</p>
        <div className="mt-4"><SizeSearch basePath="/tires/search" /></div>
      </header>

      <nav aria-label="หมวดสินค้า" className="flex flex-wrap gap-2">
        <Link href="/tires" className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${!type ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)] text-[var(--lp-accent-fg)]' : 'border-[var(--lp-line)] bg-white'}`}>ทุกหมวด</Link>
        {TYPES.map(([value, label]) => (
          <Link key={value} href={`/tires?type=${value}`} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${type === value ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)] text-[var(--lp-accent-fg)]' : 'border-[var(--lp-line)] bg-white'}`}>{label}</Link>
        ))}
      </nav>

      {!type && (
        <section aria-labelledby="sizes-heading">
          <h2 id="sizes-heading" className="text-lg font-bold">ขนาดยอดนิยม</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {SEO_SIZES.map((size) => (
              <li key={size}><Link href={`/tires/size/${sizeSlug(size)}`} className="inline-block rounded-full border border-[var(--lp-line)] bg-white px-3 py-1.5 font-mono text-sm hover:border-[var(--lp-accent)] hover:text-[var(--lp-accent)]">{size}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="brands-heading">
        <h2 id="brands-heading" className="text-lg font-bold">แบรนด์{type ? `ใน${DEALER_TYPE_LABELS[type]}` : 'ทั้งหมด'}</h2>
        {!catalog ? <div className="mt-3"><CatalogUnavailable /></div> : brands.length === 0 ? <p className="mt-3 text-sm text-[var(--lp-muted)]">ยังไม่มีสินค้าในหมวดนี้</p> : (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {brands.map((b) => (
              <li key={b.brand}>
                <Link href={`/tires/brand/${encodeURIComponent(b.brand.toLowerCase())}${type ? `?type=${type}` : ''}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--lp-line)] bg-white px-4 py-3 hover:border-[var(--lp-accent)]">
                  {brandLogo(b.brand) ? (
                    <Image src={brandLogo(b.brand)!} alt={b.name} width={140} height={48} className="h-auto max-h-9 w-auto max-w-[130px] object-contain" />
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--lp-accent-soft)] text-xs font-black text-[var(--lp-accent)]">{b.brand.slice(0, 3)}</span>
                      <span className="min-w-0 truncate font-bold">{b.name}</span>
                    </span>
                  )}
                  <span className="shrink-0 whitespace-nowrap text-xs text-[var(--lp-muted)]">{b.count} <ArrowRight className="inline size-3" aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {type && catalog && (
        <section aria-labelledby="featured-heading" className="space-y-3">
          <h2 id="featured-heading" className="text-lg font-bold">ตัวอย่างสินค้า{DEALER_TYPE_LABELS[type]}</h2>
          <PublicResults items={featured} emptyHint="ยังไม่มีสินค้าในหมวดนี้" loginNext={`/shop/search?type=${type}`} />
        </section>
      )}
    </div>
  );
}
