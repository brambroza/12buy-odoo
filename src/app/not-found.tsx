import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingFooter } from '@/components/landing/landing-footer';
import { NotFoundState } from '@/components/system/not-found-state';
import { getLandingContent } from '@/lib/landing/repo';

export const metadata: Metadata = { title: 'ไม่พบหน้า', robots: { index: false, follow: false } };

/** Site-wide 404 in the public red/white theme. */
export default async function NotFound() {
  const { contact } = await getLandingContent();
  return (
    <div className="landing flex min-h-screen flex-col">
      <LandingHeader phone={contact.phone} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4">
        <NotFoundState theme="landing" searchHref="/tires" searchLabel="ดูแคตตาล็อก" />
      </main>
      <LandingFooter />
    </div>
  );
}
