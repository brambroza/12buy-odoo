import { LandingHeader } from '@/components/landing/landing-header';
import { LandingFooter } from '@/components/landing/landing-footer';
import { getLandingContent } from '@/lib/landing/repo';

/** Legal pages (privacy notice, terms) in the public red/white shell, readable width. */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const { contact } = await getLandingContent();
  return (
    <div className="landing flex min-h-screen flex-col">
      <LandingHeader phone={contact.phone} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8 outline-none">
        <article className="legal rounded-2xl border border-[var(--lp-line)] bg-white p-6 shadow-sm md:p-10">{children}</article>
      </main>
      <LandingFooter />
    </div>
  );
}
