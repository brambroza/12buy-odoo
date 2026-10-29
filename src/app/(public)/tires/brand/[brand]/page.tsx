import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { brandLogo, brandName } from '@/lib/landing-content';
import { loadPublicCatalog, parseDealerType, publicSearch } from '@/lib/shop/public-catalog';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { SITE, absoluteUrl, breadcrumbJsonLd } from '@/lib/seo';
import { CatalogUnavailable, Crumbs, PublicResults } from '../../_shared';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }): Promise<Metadata> {
  const { brand } = await params;
  const name = brandName(decodeURIComponent(brand));
  return {
    title: `${name} ราคาส่งสำหรับดีลเลอร์`,
    description: `รายการสินค้า ${name} ทุกขนาดที่ ${SITE.name} จำหน่ายให้ดีลเลอร์ ราคาของร้านแสดงหลังเข้าสู่ระบบ`,
    alternates: { canonical: absoluteUrl(`/tires/brand/${brand.toLowerCase()}`) },
  };
}

/** All products of one brand code (as classified from the Odoo category), optionally narrowed by family. */
export default async function BrandPage({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<{ type?: string }> }) {
  const [{ brand }, { type: rawType }] = await Promise.all([params, searchParams]);
  const code = decodeURIComponent(brand).toUpperCase();
  const name = brandName(code);
  const type = parseDealerType(rawType);
  const catalog = await loadPublicCatalog();
  const all = catalog ? publicSearch(catalog, { brand: code }) : [];
  const types = [...new Set(all.map((p) => p.dealerType))] as DealerType[];
  const items = type ? all.filter((p) => p.dealerType === type) : all;
  const crumbs = [{ name: 'หน้าแรก', path: '/' }, { name: 'แคตตาล็อก', path: '/tires' }, { name, path: `/tires/brand/${brand.toLowerCase()}` }];

  return (
    <div id="catalog-top" className="space-y-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }} />
      <Crumbs crumbs={crumbs} />
      <header className="flex items-start gap-4">
        {brandLogo(code) && <span className="flex h-16 shrink-0 items-center rounded-2xl border border-[var(--lp-line)] bg-white px-3"><Image src={brandLogo(code)!} alt={name} width={160} height={64} className="h-auto max-h-10 w-auto max-w-[120px] object-contain" /></span>}
        <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">สินค้า {name}{name !== code && <span className="ml-2 text-base font-semibold text-[var(--lp-muted)]">{code}</span>}</h1>
        <p className="mt-2 text-[var(--lp-muted)]">{all.length} รายการ · ดีลเลอร์เข้าสู่ระบบเพื่อดูราคาของร้าน</p>
        </div>
      </header>
      {types.length > 1 && (
        <nav aria-label="หมวด" className="flex flex-wrap gap-2">
          <Link href={`/tires/brand/${brand.toLowerCase()}`} className={`rounded-full border px-3 py-1 text-xs font-semibold ${!type ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)] text-[var(--lp-accent-fg)]' : 'border-[var(--lp-line)] bg-white'}`}>ทั้งหมด</Link>
          {types.map((t) => (
            <Link key={t} href={`/tires/brand/${brand.toLowerCase()}?type=${t}`} className={`rounded-full border px-3 py-1 text-xs font-semibold ${type === t ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)] text-[var(--lp-accent-fg)]' : 'border-[var(--lp-line)] bg-white'}`}>{DEALER_TYPE_LABELS[t]}</Link>
          ))}
        </nav>
      )}
      {!catalog ? <CatalogUnavailable /> : <PublicResults items={items} emptyHint="ไม่พบสินค้าของแบรนด์นี้" loginNext={`/shop/search?brand=${encodeURIComponent(code)}`} />}
    </div>
  );
}
