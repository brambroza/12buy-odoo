/**
 * Site-wide SEO constants and JSON-LD builders for the public landing page.
 * Everything here is static so the landing can be fully pre-rendered.
 */

export const SITE = {
  name: '12buy Dealer',
  legalName: 'บริษัท ดรีมเมคเกอร์-ไทย คอร์ปอเรชั่น จำกัด',
  legalNameEn: 'DreamMaker-Thai Corporation Co., Ltd.',
  address: '555/55 อาคาร SSP TOWER ชั้น 20 ซอยสุขุมวิท 63 (เอกมัย) แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110',
  postalAddress: { streetAddress: '555/55 อาคาร SSP TOWER ชั้น 20 ซอยสุขุมวิท 63 (เอกมัย)', addressLocality: 'เขตวัฒนา', addressRegion: 'กรุงเทพมหานคร', postalCode: '10110', addressCountry: 'TH' },
  emails: ['por@dreammakerthai.com', 'sapol@dreammakerthai.com'],
  businessHours: 'จ-ศ 09:00-18:00',
  description:
    'สั่งยางราคาส่งออนไลน์สำหรับดีลเลอร์และร้านยาง Bridgestone Michelin Yokohama IRC และอีกกว่า 10 แบรนด์ ค้นหาด้วยขนาดยาง เห็นราคาของร้านทันที สั่งซ้ำ 1 ปุ่ม ส่ง 77 จังหวัด ติดตามสถานะผ่าน LINE',
  locale: 'th_TH',
  lineId: '@arisun',
  phone: '090-665-9835',
  keywords: [
    'สั่งยางออนไลน์',
    'ดีลเลอร์ยาง',
    'ยางรถยนต์ราคาส่ง',
    'ยางรถบรรทุกราคาส่ง',
    'ยางมอเตอร์ไซค์ราคาส่ง',
    'ร้านยาง B2B',
    'ระบบสั่งซื้อดีลเลอร์',
    'ยางราคาส่ง',
    'ร้านยางสั่งยาง',
    'ยาง Bridgestone ราคาส่ง',
    'ยาง Michelin ราคาส่ง',
    'ยาง Yokohama ราคาส่ง',
    '12buy',
  ],
} as const;

/**
 * Canonical site origin. Reads `NEXT_PUBLIC_SITE_URL` and falls back to localhost
 * so builds never fail when the variable is missing.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/** Builds an absolute URL from a path, normalising duplicate slashes. */
export function absoluteUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${siteUrl()}${clean}`;
}

/** schema.org FAQPage node from question/answer pairs. */
export function faqJsonLd(items: readonly { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
  };
}

/** schema.org BreadcrumbList from ordered `{ name, path }` crumbs. */
export function breadcrumbJsonLd(crumbs: readonly { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, name: crumb.name, item: absoluteUrl(crumb.path) })),
  };
}

/** schema.org Organization + WebSite graph for the landing page, plus FAQ and brand list when supplied. */
export function landingJsonLd(extras: { faq?: readonly { q: string; a: string }[]; brands?: readonly string[] } = {}): Record<string, unknown> {
  const url = absoluteUrl('/');
  const graph: Record<string, unknown>[] = [
      {
        '@type': 'Organization',
        '@id': `${url}#organization`,
        name: SITE.legalName,
        url,
        logo: absoluteUrl('/opengraph-image'),
        address: { '@type': 'PostalAddress', ...SITE.postalAddress },
        email: SITE.emails[0],
        contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', telephone: SITE.phone, email: SITE.emails[0], availableLanguage: ['th'] }],
      },
      {
        '@type': 'WebSite',
        '@id': `${url}#website`,
        name: SITE.name,
        url,
        inLanguage: 'th',
        publisher: { '@id': `${url}#organization` },
      },
      {
        '@type': 'WebApplication',
        name: SITE.name,
        url,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: SITE.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'THB', description: 'สมัครเป็นดีลเลอร์ฟรี' },
      },
  ];
  if (extras.faq?.length) graph.push(faqJsonLd(extras.faq));
  if (extras.brands?.length) {
    graph.push({
      '@type': 'ItemList',
      name: 'แบรนด์ที่จำหน่าย',
      itemListElement: extras.brands.map((name, i) => ({ '@type': 'ListItem', position: i + 1, name })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
