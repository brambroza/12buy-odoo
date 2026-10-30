import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/** PWA manifest so dealers can pin the shop to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: '12buy',
    description: SITE.description,
    start_url: '/shop',
    display: 'standalone',
    background_color: '#fff7f7',
    theme_color: '#d9342b',
    lang: 'th',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/maskable-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['business', 'shopping'],
    orientation: 'portrait',
    scope: '/',
  };
}
