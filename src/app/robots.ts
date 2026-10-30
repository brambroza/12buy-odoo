import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/** Private areas no crawler should index. */
const PRIVATE_PATHS = ['/tires/search?', '/shop', '/admin', '/api', '/dashboard', '/sale-orders', '/customers', '/products', '/login', '/account', '/activate', '/forgot-password', '/setup'];

/**
 * AI search and answer-engine crawlers, allowed explicitly so the public catalog
 * can be cited by ChatGPT, Claude, Perplexity, Gemini and Copilot (GEO).
 */
export const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot', 'meta-externalagent',
] as const;

/** Allow the landing, public catalog and llms.txt; keep dealer, admin and API routes out of every crawler. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/tires', '/llms.txt'], disallow: PRIVATE_PATHS },
      { userAgent: [...AI_BOTS], allow: ['/', '/tires', '/llms.txt'], disallow: PRIVATE_PATHS },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
