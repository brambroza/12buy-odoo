import { describe, expect, it } from 'vitest';
import { buildLlmsTxt } from '@/lib/llms';
import robots from '@/app/robots';
import { SITE } from '@/lib/seo';

describe('buildLlmsTxt', () => {
  const text = buildLlmsTxt();

  it('starts with the llmstxt.org H1 + blockquote header', () => {
    const [h1, blank, quote] = text.split('\n');
    expect(h1).toBe(`# ${SITE.name}`);
    expect(blank).toBe('');
    expect(quote.startsWith('> ')).toBe(true);
  });

  it('lists public pages, brands, sizes and FAQ', () => {
    expect(text).toContain('/tires/brand/yk');
    expect(text).toContain('/tires/size/195-65r15');
    expect(text).toContain('## คำถามที่พบบ่อย');
    expect(text).toContain(SITE.phone);
  });

  it('never links private areas', () => {
    for (const path of ['/shop', '/admin', '/api', '/login']) expect(text).not.toContain(`${path}`);
  });
});

describe('robots', () => {
  it('names AI crawlers and still blocks private paths for them', () => {
    const rules = robots().rules as { userAgent: string | string[]; disallow: string[] }[];
    const ai = rules.find((r) => Array.isArray(r.userAgent) && r.userAgent.includes('GPTBot'));
    expect(ai).toBeDefined();
    expect(ai!.userAgent).toContain('ClaudeBot');
    expect(ai!.disallow).toContain('/admin');
    expect(ai!.disallow).toContain('/shop');
  });
});
