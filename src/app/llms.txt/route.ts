import { buildLlmsTxt } from '@/lib/llms';
import { getLandingContent } from '@/lib/landing/repo';

/** Cached; refreshed hourly and whenever admins save the contact section (revalidatePath layout). */
export const revalidate = 3600;

/** Serves `/llms.txt` as plain Markdown for AI crawlers and assistants; contact block from the landing CMS. */
export async function GET(): Promise<Response> {
  const { contact } = await getLandingContent();
  return new Response(buildLlmsTxt(contact), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
