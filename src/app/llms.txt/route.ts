import { buildLlmsTxt } from '@/lib/llms';

/** Static: content only changes with a deploy. */
export const dynamic = 'force-static';

/** Serves `/llms.txt` as plain Markdown for AI crawlers and assistants. */
export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
