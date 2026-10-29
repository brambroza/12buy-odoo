import { afterEach, describe, expect, it } from 'vitest';
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd, landingJsonLd, siteUrl } from '@/lib/seo';

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe('siteUrl', () => {
  it('falls back to localhost when env is missing', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('strips trailing slashes and whitespace', () => {
    process.env.NEXT_PUBLIC_SITE_URL = ' https://dealer.12buy.co.th/// ';
    expect(siteUrl()).toBe('https://dealer.12buy.co.th');
  });
});

describe('absoluteUrl', () => {
  it('joins paths with and without a leading slash', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x.test';
    expect(absoluteUrl('login')).toBe('https://x.test/login');
    expect(absoluteUrl('/login')).toBe('https://x.test/login');
    expect(absoluteUrl()).toBe('https://x.test/');
  });
});

describe('landingJsonLd', () => {
  it('produces an Organization + WebSite graph with absolute ids', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x.test';
    const ld = landingJsonLd() as { '@context': string; '@graph': { '@type': string; '@id'?: string; url: string }[] };
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@graph'].map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'WebApplication']);
    expect(ld['@graph'][0]['@id']).toBe('https://x.test/#organization');
    expect(ld['@graph'].every((n) => n.url === 'https://x.test/')).toBe(true);
  });

  it('appends FAQPage and ItemList when extras are given', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x.test';
    const ld = landingJsonLd({ faq: [{ q: 'Q1', a: 'A1' }], brands: ['Bridgestone', 'Michelin'] }) as { '@graph': Record<string, unknown>[] };
    const types = ld['@graph'].map((n) => n['@type']);
    expect(types).toEqual(['Organization', 'WebSite', 'WebApplication', 'FAQPage', 'ItemList']);
    const list = ld['@graph'][4] as { itemListElement: { name: string; position: number }[] };
    expect(list.itemListElement).toEqual([{ '@type': 'ListItem', position: 1, name: 'Bridgestone' }, { '@type': 'ListItem', position: 2, name: 'Michelin' }]);
  });
});

describe('faqJsonLd / breadcrumbJsonLd', () => {
  it('maps questions to schema.org Question nodes', () => {
    const faq = faqJsonLd([{ q: 'ส่งกี่วัน', a: '1-2 วัน' }]) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity[0].name).toBe('ส่งกี่วัน');
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe('1-2 วัน');
  });

  it('builds absolute breadcrumb items in order', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x.test';
    const bc = breadcrumbJsonLd([{ name: 'หน้าแรก', path: '/' }, { name: 'ยาง', path: '/tires' }]) as { itemListElement: { position: number; item: string }[] };
    expect(bc.itemListElement.map((c) => [c.position, c.item])).toEqual([[1, 'https://x.test/'], [2, 'https://x.test/tires']]);
  });
});
