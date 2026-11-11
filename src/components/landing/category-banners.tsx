import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { isUploadedImage, type LandingContent } from '@/lib/landing/cms';

/**
 * Showcase of the real product banners from the 12buy storefront.
 * Desktop stacks the wide artwork; mobile swipes through the tall artwork.
 */
export function CategoryBanners({ eyebrow, heading, items }: Omit<LandingContent['banners'], 'show'>) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-5xl px-4 py-16" aria-labelledby="banners-heading">
      <div data-reveal className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--lp-accent)]">{eyebrow}</p>
          <h2 id="banners-heading" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{heading}</h2>
        </div>
        <Link href="/shop" className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--lp-accent)] hover:underline sm:inline-flex">
          ดูทั้งหมด <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {/* Mobile: horizontal snap carousel of tall banners */}
      <ul className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((banner, i) => (
          <li key={`${banner.title}-${i}`} className="w-[78%] shrink-0 snap-center">
            <Link href={banner.href} className="group block overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-white shadow-lg shadow-[var(--lp-accent)]/10">
              <div className="relative aspect-[7/10]">
                <Image src={banner.tall} alt={`${banner.title} ${banner.brands}`} fill sizes="80vw" unoptimized={isUploadedImage(banner.tall)} className="object-cover transition duration-500 group-hover:scale-[1.03]" />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-bold">{banner.title}</p>
                  <p className="text-xs text-[var(--lp-muted)]">{banner.brands}</p>
                </div>
                <ArrowRight className="size-4 text-[var(--lp-accent)]" aria-hidden="true" />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop: stacked wide banners */}
      <ul className="mt-8 hidden gap-5 md:grid">
        {items.map((banner, i) => (
          <li key={`${banner.title}-${i}`} data-reveal={i * 0.08}>
            <Link href={banner.href} className="group relative block overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-white shadow-xl shadow-[var(--lp-accent)]/10 transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-[var(--lp-accent)]/20">
              <div className="relative aspect-[1920/651]">
                <Image src={banner.wide} alt={`${banner.title} ${banner.brands}`} fill sizes="(min-width: 1024px) 1024px, 100vw" unoptimized={isUploadedImage(banner.wide)} className="object-cover transition duration-700 group-hover:scale-[1.02]" />
              </div>
              <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-accent)] px-4 py-2 text-sm font-bold text-[var(--lp-accent-fg)] shadow-lg transition group-hover:brightness-110">
                สั่งซื้อ{banner.title} <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link href="/shop" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[var(--lp-accent)] hover:underline sm:hidden">
        ดูสินค้าทั้งหมด <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
