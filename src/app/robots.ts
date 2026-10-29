import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/** Allow the landing and public catalog; keep dealer, admin and API routes out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/tires'], disallow: ['/tires/search?', '/shop', '/admin', '/api', '/dashboard', '/sale-orders', '/customers', '/products', '/login'] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
