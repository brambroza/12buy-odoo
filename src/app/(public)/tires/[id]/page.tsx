import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { findProduct } from '@/lib/shop/catalog';
import { STOCK_LABELS, loadPublicCatalog, publicSearch, toPublicProduct } from '@/lib/shop/public-catalog';
import { SITE, absoluteUrl, breadcrumbJsonLd } from '@/lib/seo';
import { PublicProductCard } from '@/components/landing/public-product-card';
import { CatalogUnavailable, Crumbs } from '../_shared';

export const revalidate = 300;

async function loadProduct(id: string) {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) return { catalog: null, product: null };
  const catalog = await loadPublicCatalog();
  const raw = catalog ? findProduct(catalog, productId) : undefined;
  return { catalog, product: raw ? toPublicProduct(raw) : null };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { product } = await loadProduct(id);
  if (!product) return { title: 'ไม่พบสินค้า', robots: { index: false } };
  return {
    title: `${product.name} ราคาส่งดีลเลอร์`,
    description: `${product.name} ${product.brandName} ${product.typeLabel}${product.size ? ` ขนาด ${product.size.label}` : ''} จาก ${SITE.name} ราคาของร้านแสดงหลังเข้าสู่ระบบ`,
    alternates: { canonical: absoluteUrl(`/tires/${id}`) },
  };
}

/** Public product detail: specs, stock signal, same-size alternatives. No price. */
export default async function PublicProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { catalog, product } = await loadProduct(id);
  if (catalog && !product) notFound();
  if (!catalog || !product) return <div id="catalog-top"><CatalogUnavailable /></div>;

  const sameSize = product.size ? publicSearch(catalog, { query: product.size.label }).filter((p) => p.id !== product.id).slice(0, 6) : [];
  const crumbs = [{ name: 'หน้าแรก', path: '/' }, { name: 'แคตตาล็อก', path: '/tires' }, { name: product.brandName, path: `/tires/brand/${product.brand.toLowerCase()}` }, { name: product.name, path: `/tires/${product.id}` }];
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    brand: { '@type': 'Brand', name: product.brandName },
    category: product.typeLabel,
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    url: absoluteUrl(`/tires/${product.id}`),
  };

  return (
    <div id="catalog-top" className="space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd(crumbs), productLd]) }} />
      <Crumbs crumbs={crumbs} />
      <article className="grid gap-6 rounded-3xl border border-[var(--lp-line)] bg-white p-5 md:grid-cols-[320px_1fr] md:p-8">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} width={320} height={320} className="aspect-square w-full rounded-2xl bg-[var(--lp-bg-2)] object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-2xl bg-[var(--lp-bg-2)] text-sm text-[var(--lp-muted)]">ไม่มีรูป</div>
        )}
        <div>
          <p className="text-sm text-[var(--lp-muted)]">{product.brandName} · {product.typeLabel}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{product.name}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {product.size && <div className="rounded-xl bg-[var(--lp-bg-2)] p-3"><dt className="text-xs text-[var(--lp-muted)]">ขนาด</dt><dd className="font-mono font-bold">{product.size.label}</dd></div>}
            <div className="rounded-xl bg-[var(--lp-bg-2)] p-3"><dt className="text-xs text-[var(--lp-muted)]">สต็อก</dt><dd className="font-bold">{STOCK_LABELS[product.stock]}</dd></div>
          </dl>
          <div className="mt-6 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-accent-soft)] p-4">
            <p className="font-bold">ราคาดีลเลอร์แสดงหลังเข้าสู่ระบบ</p>
            <p className="mt-1 text-sm text-[var(--lp-muted)]">ราคาต่างกันตามระดับร้านและโซนจัดส่ง สั่งซื้อและติดตามสถานะได้ทันทีหลังเข้าสู่ระบบ</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link href={`/login?next=${encodeURIComponent(`/shop/product/${product.id}`)}`} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] px-5 py-3 text-sm font-bold text-[var(--lp-accent-fg)] hover:brightness-110">
                <LogIn className="size-4" aria-hidden="true" /> เข้าสู่ระบบดูราคา
              </Link>
              <Link href="/#register" className="inline-flex items-center justify-center rounded-full border border-[var(--lp-line)] bg-white px-5 py-3 text-sm font-semibold hover:border-[var(--lp-accent)]">สมัครเป็นดีลเลอร์</Link>
            </div>
          </div>
        </div>
      </article>
      {sameSize.length > 0 && (
        <section aria-labelledby="same-size-heading" className="space-y-3">
          <h2 id="same-size-heading" className="text-lg font-bold">ขนาดเดียวกันจากแบรนด์อื่น</h2>
          <ul className="grid gap-3 md:grid-cols-2">{sameSize.map((p) => <li key={p.id}><PublicProductCard product={p} /></li>)}</ul>
        </section>
      )}
    </div>
  );
}
