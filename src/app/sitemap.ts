import type { MetadataRoute } from 'next';
import { SEO_SIZES, sizeSlug } from '@/lib/landing-content';
import { listBrands, loadPublicCatalog } from '@/lib/shop/public-catalog';
import { absoluteUrl } from '@/lib/seo';

/** Public, indexable pages only. Dealer/admin areas are excluded on purpose. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const catalog = await loadPublicCatalog();
  const brands = catalog ? listBrands(catalog) : [];
  return [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/tires'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...SEO_SIZES.map((size) => ({ url: absoluteUrl(`/tires/size/${sizeSlug(size)}`), lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...brands.map((b) => ({ url: absoluteUrl(`/tires/brand/${encodeURIComponent(b.brand.toLowerCase())}`), lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7 })),
  ];
}
