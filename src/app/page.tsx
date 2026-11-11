import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Bike, BatteryCharging, Bell, CircleDot, ClipboardList, FileText, ListPlus, MapPin, MessageCircle, Quote, RotateCcw, Search, ShieldCheck, Smartphone, Tag, Truck, Car, Wallet } from 'lucide-react';
import { LandingMotion } from '@/components/landing/landing-motion';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingFooter } from '@/components/landing/landing-footer';
import { CategoryBanners } from '@/components/landing/category-banners';
import { SizeDemo } from '@/components/landing/size-demo';
import { SearchPanel } from '@/components/landing/search-panel';
import { BrandGrid } from '@/components/landing/brand-grid';
import { Promotions } from '@/components/landing/promotions';
import { Faq } from '@/components/landing/faq';
import { RegisterForm } from '@/components/landing/register-form';
import { StickyCta } from '@/components/landing/sticky-cta';
import { BRANDS, PROMOTIONS } from '@/lib/landing-content';
import { isUploadedImage } from '@/lib/landing/cms';
import { getLandingContent } from '@/lib/landing/repo';
import { listBrands, loadPublicCatalog } from '@/lib/shop/public-catalog';
import { listPromotions } from '@/lib/admin/store';
import { buildSizeOptions } from '@/lib/shop/size-options';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS } from '@/lib/shop/types';
import { SITE, absoluteUrl, landingJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: `${SITE.name} — สั่งยางออนไลน์สำหรับดีลเลอร์ ค้นหาด้วยขนาด เห็นราคาของร้านทันที`,
  description: SITE.description,
  keywords: [...SITE.keywords],
  alternates: { canonical: absoluteUrl('/') },
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    url: absoluteUrl('/'),
    siteName: SITE.name,
    title: `${SITE.name} — สั่งยางออนไลน์สำหรับดีลเลอร์`,
    description: SITE.description,
  },
  twitter: { card: 'summary_large_image', title: SITE.name, description: SITE.description },
  robots: { index: true, follow: true },
};

/** Icons stay in code; the matching text comes from the landing CMS (same order, fixed length). */
const CATEGORY_ICONS = [Car, Truck, Bike, BatteryCharging, CircleDot] as const;
const FEATURE_ICONS = [Search, Tag, RotateCcw, ListPlus, ClipboardList, Bell] as const;
const TRUST_ICONS = [MapPin, FileText, Wallet, ShieldCheck] as const;

/** Re-render at most every 5 minutes so the search dropdowns track the catalog. */
export const revalidate = 300;

/** Public landing page shown before dealers log in. Mobile-first; search options come from the live catalog. */
export default async function LandingPage() {
  // Cards managed in /admin/promotions; the coded defaults show only until the first one is saved.
  const saved = await listPromotions().catch(() => []);
  const promotions = saved.length ? saved.filter((p) => p.active).map(({ title, body, image, from, to, href }) => ({ title, body, image, from, to, href })) : PROMOTIONS;
  const [catalog, content] = await Promise.all([loadPublicCatalog(), getLandingContent()]);
  const { hero, trust, brands, categories, banners, demo, features, steps, testimonials, faq, register } = content;
  const sizeOptions = catalog ? buildSizeOptions(catalog.products) : [];
  const brandOptions = catalog ? listBrands(catalog) : [];
  return (
    <LandingMotion>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd({ faq: faq.show ? faq.items : [], brands: BRANDS.map((b) => b.name) })) }} />
      <LandingHeader />

      <main id="main" tabIndex={-1} className="pb-20 outline-none md:pb-0">
        {/* Hero */}
        <section id="hero" className="relative overflow-hidden">
          <div className="lp-grid absolute inset-0" aria-hidden="true" />
          <div className="lp-glow absolute inset-x-0 top-0 h-[520px]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-5xl gap-8 px-4 pb-14 pt-12 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-20">
            <div>
              <p data-hero="badge" className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-line)] bg-[var(--lp-bg-2)] px-3 py-1 text-xs text-[var(--lp-muted)]">
                <Smartphone className="size-3.5 text-[var(--lp-accent)]" aria-hidden="true" /> {hero.badge}
              </p>
              <h1 data-hero="title" className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
                <span className="block">{hero.titleLine1}</span>
                <span className="block text-[var(--lp-accent)]">{hero.titleAccent}</span>
                {hero.titleLine3 && <span className="block">{hero.titleLine3}</span>}
              </h1>
              <p data-hero="sub" className="mt-5 max-w-md text-base text-[var(--lp-muted)] sm:text-lg">
                {hero.sub}
              </p>
              <div data-hero="cta" className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href="#search" className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] px-6 py-3.5 text-base font-bold text-[var(--lp-accent-fg)] shadow-lg shadow-[var(--lp-accent)]/30 transition hover:brightness-110 active:scale-[0.98]">
                  <Search className="size-5" aria-hidden="true" /> {hero.primaryCta}
                </a>
                <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--lp-line)] bg-white px-6 py-3.5 text-base font-semibold transition hover:border-[var(--lp-accent)]">
                  {hero.secondaryCta} <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
              </div>
              <dl className="mt-9 grid grid-cols-3 gap-2 sm:gap-3">
                {hero.items.map((stat) => (
                  <div key={stat.label} data-hero="stat" className="min-w-0 rounded-xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)]/70 p-2.5 sm:p-3">
                    <dt className="break-words text-[10px] leading-tight text-[var(--lp-muted)] sm:text-[11px]">{stat.label}</dt>
                    <dd className="mt-1 text-xl font-extrabold">
                      <span data-counter={stat.value}>{stat.value}</span> <span className="text-xs font-semibold text-[var(--lp-muted)]">{stat.suffix}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div data-hero="art" className="relative mx-auto w-full max-w-[340px] md:max-w-[420px]">
              <div className="absolute -inset-4 rounded-[2.5rem] bg-[var(--lp-accent)]/15 blur-3xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[2rem] border border-[var(--lp-line)] bg-white shadow-2xl shadow-[var(--lp-accent)]/20">
                <div className="relative aspect-[1/1]">
                  {/* Crop to the tyre stack (top ~56% of the artwork); the brand logos are listed as text below instead. */}
                  <Image src={hero.image} alt={hero.imageAlt} fill priority sizes="(min-width: 768px) 420px, 90vw" unoptimized={isUploadedImage(hero.image)} className="object-cover object-[50%_18%]" />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[var(--lp-line)] bg-white px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--lp-muted)]">{hero.brandsLabel}</p>
                    <p className="text-sm font-bold leading-snug">{hero.brandsText}</p>
                  </div>
                  {hero.brandsBadge && <span className="shrink-0 rounded-full bg-[var(--lp-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--lp-accent)]">{hero.brandsBadge}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <SearchPanel sizes={sizeOptions} brands={brandOptions} />

        {/* Trust strip */}
        {trust.show && (
        <section className="border-y border-[var(--lp-line)] bg-white/70" aria-label="จุดเด่นสำหรับดีลเลอร์">
          <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-x-4 gap-y-5 px-4 py-6 md:grid-cols-4">
            {trust.items.map((point, i) => {
              const Icon = TRUST_ICONS[i] ?? ShieldCheck;
              return (
                <li key={point.title} data-reveal={i * 0.05} className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--lp-accent-soft)] text-[var(--lp-accent)]"><Icon className="size-5" aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-bold leading-tight">{point.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--lp-muted)]">{point.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        )}

        {/* Brands */}
        {brands.show && (
        <section className="mx-auto max-w-5xl px-4 pt-14" aria-labelledby="brands-heading">
          <div data-reveal className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--lp-accent)]">{brands.eyebrow}</p>
              <h2 id="brands-heading" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{brands.heading}</h2>
            </div>
            <Link href="/tires" className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--lp-accent)] hover:underline sm:inline-flex">
              ดูสินค้าทั้งหมด <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <BrandGrid brands={BRANDS} />
        </section>
        )}

        {/* Categories */}
        {categories.show && (
        <section className="mx-auto max-w-5xl px-4 py-16">
          <h2 data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">{categories.heading}</h2>
          <p data-reveal className="mt-2 max-w-lg text-[var(--lp-muted)]">{categories.sub}</p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {categories.items.map(({ label, note }, i) => {
              const Icon = CATEGORY_ICONS[i] ?? CircleDot;
              return (
              <li key={`${label}-${i}`} data-reveal={i * 0.06} className="group rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--lp-accent)]">
                <Icon className="size-7 text-[var(--lp-accent)]" aria-hidden="true" />
                <p className="mt-3 font-bold">{label}</p>
                <p className="text-xs text-[var(--lp-muted)]">{note}</p>
              </li>
              );
            })}
          </ul>
        </section>
        )}

        {banners.show && <CategoryBanners eyebrow={banners.eyebrow} heading={banners.heading} items={banners.items} />}

        <Promotions items={promotions} />

        {/* Demo */}
        {demo.show && (
        <section className="bg-[var(--lp-bg-2)]/60 px-4 py-16">
          <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
            <div data-reveal>
              <p className="text-sm font-semibold text-[var(--lp-accent)]">{demo.eyebrow}</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{demo.heading}</h2>
              <p className="mt-3 text-[var(--lp-muted)]">{demo.body}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {demo.items.map(({ text: t }, i) => (
                  <li key={`${t}-${i}`} className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal={0.1}>
              <SizeDemo />
            </div>
          </div>
        </section>
        )}

        {/* Features */}
        {features.show && (
        <section id="features" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-16">
          <h2 data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">{features.heading}</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {features.items.map(({ title, body }, i) => {
              const Icon = FEATURE_ICONS[i] ?? Search;
              return (
              <li key={`${title}-${i}`} data-reveal={(i % 3) * 0.08} className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--lp-accent-soft)]">
                  <Icon className="size-5 text-[var(--lp-accent)]" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-1 text-sm text-[var(--lp-muted)]">{body}</p>
              </li>
              );
            })}
          </ul>
        </section>
        )}

        {/* How it works */}
        {steps.show && (
        <section id="how" className="scroll-mt-28 bg-[var(--lp-bg-2)]/60 px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <h2 data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">{steps.heading}</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {steps.items.map((step, i) => (
                <li key={`${step.title}-${i}`} data-reveal={i * 0.1} className="relative rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5">
                  <span className="text-4xl font-black text-[var(--lp-accent)]/40">{i + 1}</span>
                  <h3 className="mt-2 font-bold">{step.title}</h3>
                  <p className="mt-1 text-sm text-[var(--lp-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>

            <div data-reveal className="mt-10 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5">
              <p className="text-sm font-semibold">{steps.statusHeading}</p>
              <ol className="mt-4 flex items-center justify-between gap-1 text-[11px] sm:text-xs">
                {ORDER_STATUS_FLOW.map((status, i) => (
                  <li key={status} className="flex flex-1 flex-col items-center gap-2 text-center">
                    <span className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? 'bg-[var(--lp-accent)] text-[var(--lp-accent-fg)]' : 'border border-[var(--lp-line)] text-[var(--lp-muted)]'}`}>{i + 1}</span>
                    <span className={i < 3 ? '' : 'text-[var(--lp-muted)]'}>{ORDER_STATUS_LABELS[status]}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
        )}

        {/* Testimonials: shown only once real dealer quotes are entered in /admin/landing. */}
        {testimonials.show && testimonials.items.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-16" aria-labelledby="voice-heading">
          <div data-reveal>
            <p className="text-sm font-semibold text-[var(--lp-accent)]">{testimonials.eyebrow}</p>
            <h2 id="voice-heading" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{testimonials.heading}</h2>
          </div>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {testimonials.items.map((t, i) => (
              <li key={`${t.shop}-${i}`} data-reveal={i * 0.08} className="rounded-2xl border border-[var(--lp-line)] bg-white p-5">
                <Quote className="size-6 text-[var(--lp-accent)]/50" aria-hidden="true" />
                <p className="mt-3 text-sm leading-relaxed">{t.quote}</p>
                <p className="mt-4 text-sm font-bold">{t.shop}</p>
                <p className="text-xs text-[var(--lp-muted)]">{t.province}</p>
              </li>
            ))}
          </ul>
        </section>
        )}

        {/* FAQ */}
        {faq.show && faq.items.length > 0 && (
        <section id="faq" className="scroll-mt-28 bg-[var(--lp-bg-2)]/60 px-4 py-16" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-3xl">
            <h2 id="faq-heading" data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">{faq.heading}</h2>
            <Faq items={faq.items} />
          </div>
        </section>
        )}

        {/* Register */}
        {register.show && (
        <section id="register" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-16">
          <div data-reveal className="relative overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-gradient-to-br from-[var(--lp-accent-soft)] via-[var(--lp-bg-2)] to-[var(--lp-bg)] p-6 sm:p-10">
            <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{register.heading}</h2>
                <p className="mt-3 text-[var(--lp-muted)]">{register.body}</p>
                <div className="mt-6 flex flex-col gap-3">
                  <a href={`https://line.me/R/ti/p/${encodeURIComponent(SITE.lineId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#06C755] px-6 py-3.5 text-base font-bold text-white transition hover:brightness-110">
                    <MessageCircle className="size-5" aria-hidden="true" /> ทัก LINE {SITE.lineId}
                  </a>
                  <a href={`tel:${SITE.phone.replace(/-/g, '')}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--lp-line)] bg-white px-6 py-3.5 text-base font-semibold transition hover:border-[var(--lp-accent)]">
                    โทร {SITE.phone}
                  </a>
                </div>
                <p className="mt-4 text-xs text-[var(--lp-muted)]">มีบัญชีแล้ว? <Link href="/login" className="text-[var(--lp-accent)] underline-offset-2 hover:underline">เข้าสู่ระบบ</Link></p>
              </div>
              <div className="rounded-2xl border border-[var(--lp-line)] bg-white/80 p-5 backdrop-blur">
                <RegisterForm />
              </div>
            </div>
          </div>
        </section>
        )}
      </main>

      <LandingFooter />
      <StickyCta />
    </LandingMotion>
  );
}
