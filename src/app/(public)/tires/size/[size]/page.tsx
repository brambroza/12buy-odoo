import type { Metadata } from 'next';
import Link from 'next/link';
import { SizeSearch } from '@/components/shop/size-search';
import { SEO_SIZES, sizeLabelFromSlug, sizeSlug } from '@/lib/landing-content';
import { loadPublicCatalog, publicSearch } from '@/lib/shop/public-catalog';
import { SITE, absoluteUrl, breadcrumbJsonLd } from '@/lib/seo';
import { CatalogUnavailable, Crumbs, PublicResults } from '../../_shared';

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return SEO_SIZES.map((size) => ({ size: sizeSlug(size) }));
}

export async function generateMetadata({ params }: { params: Promise<{ size: string }> }): Promise<Metadata> {
  const { size } = await params;
  const label = sizeLabelFromSlug(size);
  return {
    title: `ยาง ${label} ราคาส่งสำหรับดีลเลอร์ ทุกแบรนด์`,
    description: `รวมยางขนาด ${label} ทุกแบรนด์ที่ ${SITE.name} จำหน่ายให้ดีลเลอร์และร้านยาง เช็กสต็อกก่อนสั่ง ราคาของร้านแสดงหลังเข้าสู่ระบบ`,
    alternates: { canonical: absoluteUrl(`/tires/size/${size}`) },
  };
}

/** Pre-rendered landing per popular size, the main SEO entry point of the public catalog. */
export default async function SizePage({ params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const label = sizeLabelFromSlug(size);
  const catalog = await loadPublicCatalog();
  const items = catalog ? publicSearch(catalog, { query: label }) : [];
  const related = SEO_SIZES.filter((s) => s !== label).slice(0, 8);
  const crumbs = [{ name: 'หน้าแรก', path: '/' }, { name: 'แคตตาล็อก', path: '/tires' }, { name: label, path: `/tires/size/${size}` }];

  return (
    <div id="catalog-top" className="space-y-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }} />
      <Crumbs crumbs={crumbs} />
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">ยางขนาด <span className="font-mono text-[var(--lp-accent)]">{label}</span> ราคาส่ง</h1>
        <p className="mt-2 max-w-2xl text-[var(--lp-muted)]">ทุกแบรนด์ที่มีในขนาดนี้ พร้อมสถานะสต็อก ดีลเลอร์เข้าสู่ระบบเพื่อดูราคาของร้านและสั่งซื้อ</p>
      </header>
      <SizeSearch initial={label} basePath="/tires/search" />
      {!catalog ? <CatalogUnavailable /> : (
        <>
          <p className="text-xs text-[var(--lp-muted)]">{items.length} รายการ</p>
          <PublicResults items={items} emptyHint="ขนาดนี้ยังไม่มีในระบบ ทัก LINE เพื่อสอบถามได้" loginNext={`/shop/search?q=${encodeURIComponent(label)}`} />
        </>
      )}
      <section aria-labelledby="related-heading">
        <h2 id="related-heading" className="text-sm font-semibold text-[var(--lp-muted)]">ขนาดใกล้เคียง</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {related.map((s) => <li key={s}><Link href={`/tires/size/${sizeSlug(s)}`} className="inline-block rounded-full border border-[var(--lp-line)] bg-white px-3 py-1 font-mono text-xs hover:border-[var(--lp-accent)]">{s}</Link></li>)}
        </ul>
      </section>
    </div>
  );
}
