import { LandingHeader } from '@/components/landing/landing-header';
import { LandingFooter } from '@/components/landing/landing-footer';
import { StickyCta } from '@/components/landing/sticky-cta';
import { getLandingContent } from '@/lib/landing/repo';

/** Public catalog shell: same red/white theme and header as the landing, no dealer session required. */
export default async function PublicCatalogLayout({ children }: { children: React.ReactNode }) {
  const { contact } = await getLandingContent();
  return (
    <div className="landing flex min-h-screen flex-col">
      <LandingHeader phone={contact.phone} />
      <main id="hero" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:pb-12"><div id="main" tabIndex={-1} className="outline-none">{children}</div></main>
      <LandingFooter />
      <StickyCta sentinelId="catalog-top" lineId={contact.lineId} />
    </div>
  );
}
