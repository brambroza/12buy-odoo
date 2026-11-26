/**
 * Site-wide SEO constants and JSON-LD builders for the public landing page.
 * Everything here is static so the landing can be fully pre-rendered.
 */

export const SITE = {
  name: '12buy Dealer',
  legalName: 'บริษัท วันทูบาย ช้อป จำกัด',
  legalNameEn: '12BUY SHOP CO., LTD.',
  address: '1000/53 อาคารลิเบอร์ตี้พล่าซ่า ชั้นที่ 3 ซอย สุขุมวิท 55 (ทองหล่อ) แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
  postalAddress: { streetAddress: '1000/53 อาคารลิเบอร์ตี้พล่าซ่า ชั้นที่ 3 ซอย สุขุมวิท 55 (ทองหล่อ) แขวงคลองตันเหนือ', addressLocality: 'เขตวัฒนา', addressRegion: 'กรุงเทพมหานคร', postalCode: '10110', addressCountry: 'TH' },
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
    'ยางราคาส่ง กรุงเทพ',
    'ขายส่งยาง ต่างจังหวัด',
    'ยางราคาส่ง เชียงใหม่',
    'ยางราคาส่ง ขอนแก่น',
    'ยางราคาส่ง หาดใหญ่',
    'ตัวแทนจำหน่ายยาง',
    'หาซัพพลายเออร์ยาง',
    'รับสมัครดีลเลอร์ยาง',
    'เปิดร้านยางต้องสั่งยางที่ไหน',
    'ยางเครดิตเทอม',
    'แบตเตอรี่ราคาส่ง',
    'แบตเตอรี่ GS ราคาส่ง',
    'กระทะล้อราคาส่ง',
    'ยาง TBR ราคาส่ง',
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

/** Editable company contact (landing CMS `contact` section); `SITE` values when not supplied. */
export type ContactInfo = { legalName: string; address: string; phone: string; items: readonly { email: string }[] };

/**
 * schema.org Organization + WebSite graph for the landing page, plus FAQ and brand list when supplied.
 * The structured postal address is coded; once an admin edits the address it is sent as one street line.
 */
export function landingJsonLd(extras: { faq?: readonly { q: string; a: string }[]; brands?: readonly string[]; contact?: ContactInfo } = {}): Record<string, unknown> {
  const url = absoluteUrl('/');
  const contact = extras.contact;
  const legalName = contact?.legalName ?? SITE.legalName;
  const phone = contact?.phone ?? SITE.phone;
  const email = contact ? contact.items[0]?.email : SITE.emails[0];
  const address = !contact || contact.address === SITE.address ? SITE.postalAddress : { streetAddress: contact.address, addressCountry: 'TH' };
  const graph: Record<string, unknown>[] = [
      {
        '@type': 'Organization',
        '@id': `${url}#organization`,
        name: legalName,
        url,
        logo: absoluteUrl('/opengraph-image'),
        address: { '@type': 'PostalAddress', ...address },
        email,
        contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', telephone: phone, email, availableLanguage: ['th'] }],
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
