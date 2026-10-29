import type { Metadata } from 'next';
import { SizeSearch } from '@/components/shop/size-search';
import { loadPublicCatalog, parseDealerType, publicSearch } from '@/lib/shop/public-catalog';
import { absoluteUrl, breadcrumbJsonLd } from '@/lib/seo';
import { CatalogUnavailable, Crumbs, PublicResults } from '../_shared';

export const revalidate = 300;

type Search = { q?: string; type?: string; brand?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim();
  return {
    title: query ? `ยางขนาด ${query} ราคาส่งทุกแบรนด์` : 'ค้นหายางตามขนาด',
    description: query ? `รายการยางขนาด ${query} ทุกแบรนด์ที่มีจำหน่าย ราคาดีลเลอร์แสดงหลังเข้าสู่ระบบ` : 'พิมพ์ขนาดยางเพื่อดูทุกแบรนด์ที่มีจำหน่ายสำหรับดีลเลอร์',
    alternates: { canonical: absoluteUrl('/tires/search') },
    robots: query ? { index: false, follow: true } : undefined,
  };
}

/** Public size search. Free-text queries are `noindex`; the SEO pages live at `/tires/size/[size]`. */
export default async function PublicSearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const type = parseDealerType(params.type);
  const catalog = await loadPublicCatalog();
  const items = catalog ? publicSearch(catalog, { query, type, brand: params.brand }) : [];
  const crumbs = [{ name: 'หน้าแรก', path: '/' }, { name: 'แคตตาล็อก', path: '/tires' }, { name: query ? `ค้นหา “${query}”` : 'ค้นหา', path: '/tires/search' }];
  const loginNext = `/shop/search?q=${encodeURIComponent(query)}`;

  return (
    <div id="catalog-top" className="space-y-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }} />
      <Crumbs crumbs={crumbs} />
      <h1 className="text-2xl font-extrabold tracking-tight">{query ? <>ยางขนาด <span className="font-mono text-[var(--lp-accent)]">{query}</span></> : 'ค้นหายางตามขนาด'}</h1>
      <SizeSearch initial={query} autoFocus={!query} basePath="/tires/search" />
      {!catalog ? <CatalogUnavailable /> : (
        <>
          <p className="text-xs text-[var(--lp-muted)]">{items.length} รายการ · เรียงตามแบรนด์และขนาด</p>
          <PublicResults items={items} emptyHint="ไม่พบขนาดนี้ ลองพิมพ์เฉพาะตัวเลข เช่น 19565 หรือขอบล้อ เช่น R15" loginNext={loginNext} />
        </>
      )}
    </div>
  );
}
