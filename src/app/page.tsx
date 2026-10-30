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
import { BRANDS, FAQ, PROMOTIONS, TRUST_POINTS, publishedTestimonials } from '@/lib/landing-content';
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

const CATEGORIES = [
  { icon: Car, label: 'ยางรถยนต์', note: 'เก๋ง กระบะ SUV' },
  { icon: Truck, label: 'ยางรถบรรทุก', note: 'TBR ทุกขนาด' },
  { icon: Bike, label: 'ยางมอเตอร์ไซค์', note: 'ครอบครัว สปอร์ต บิ๊กไบค์' },
  { icon: BatteryCharging, label: 'แบตเตอรี่', note: 'ทุกยี่ห้อยอดนิยม' },
  { icon: CircleDot, label: 'กระทะล้อ', note: 'เหล็ก อัลลอย' },
] as const;

const FEATURES = [
  { icon: Search, title: 'ค้นหาด้วยขนาด', body: 'พิมพ์ 195/65R15 หรือ 1956515 ก็หาเจอ เห็นทุกยี่ห้อ เรียงราคาถูกไปแพง' },
  { icon: Tag, title: 'ราคาของร้านคุณ', body: 'ไม่มีราคากลางให้สับสน ทุกหน้าแสดงราคาตามสิทธิ์ของร้านทันทีที่เข้าสู่ระบบ' },
  { icon: RotateCcw, title: 'สั่งซ้ำ 1 ปุ่ม', body: 'ออเดอร์ล่าสุดและสินค้าที่สั่งบ่อยอยู่หน้าแรก กดเดียวลงตะกร้า' },
  { icon: ListPlus, title: 'สั่งเร็วหลายรายการ', body: 'วางรายการ ขนาด จำนวน หลายบรรทัดลงตะกร้าทีเดียว เหมาะดีลเลอร์สั่งทีละสิบรายการ' },
  { icon: ClipboardList, title: 'สต็อกบอกตรงๆ', body: 'มี เหลือน้อย หรือสั่งจอง รู้ก่อนกดสั่ง ไม่ต้องโทรถาม' },
  { icon: Bell, title: 'แจ้งเตือนผ่าน LINE', body: 'สถานะเปลี่ยนทุกขั้น รู้ทันทีใน LINE พร้อมลิงก์กลับมาดูออเดอร์' },
] as const;

const STEPS = [
  { n: '1', title: 'สมัครและรออนุมัติ', body: 'แจ้งชื่อร้าน จังหวัด ประเภทสินค้าที่ขาย ทีมงานตรวจสอบและเปิดสิทธิ์ให้ภายใน 1 วันทำการ' },
  { n: '2', title: 'ค้นหาและสั่งซื้อ', body: 'พิมพ์ขนาดยาง เห็นราคาของร้าน กดลงตะกร้า ยืนยันที่อยู่และขนส่งหน้าเดียว' },
  { n: '3', title: 'ติดตามจนถึงมือ', body: 'ดูสถานะเป็นไทม์ไลน์ แนบสลิปโอนเงินได้ในแอป รับแจ้งเตือนทาง LINE ทุกขั้น' },
] as const;

const TRUST_ICONS = [MapPin, FileText, Wallet, ShieldCheck] as const;

const STATS = [
  { value: 60, suffix: 'วินาที', label: 'สั่งสินค้าที่รู้ขนาดแล้ว' },
  { value: 3, suffix: 'แตะ', label: 'สั่งซ้ำออเดอร์เดิม' },
  { value: 77, suffix: 'จังหวัด', label: 'จัดส่งทั่วไทย' },
] as const;

/** Re-render at most every 5 minutes so the search dropdowns track the catalog. */
export const revalidate = 300;

/** Public landing page shown before dealers log in. Mobile-first; search options come from the live catalog. */
export default async function LandingPage() {
  // Cards managed in /admin/promotions; the coded defaults show only until the first one is saved.
  const saved = await listPromotions().catch(() => []);
  const promotions = saved.length ? saved.filter((p) => p.active).map(({ title, body, image, from, to, href }) => ({ title, body, image, from, to, href })) : PROMOTIONS;
  const catalog = await loadPublicCatalog();
  const sizeOptions = catalog ? buildSizeOptions(catalog.products) : [];
  const brandOptions = catalog ? listBrands(catalog) : [];
  return (
    <LandingMotion>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd({ faq: FAQ, brands: BRANDS.map((b) => b.name) })) }} />
      <LandingHeader />

      <main id="main" tabIndex={-1} className="pb-20 outline-none md:pb-0">
        {/* Hero */}
        <section id="hero" className="relative overflow-hidden">
          <div className="lp-grid absolute inset-0" aria-hidden="true" />
          <div className="lp-glow absolute inset-x-0 top-0 h-[520px]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-5xl gap-8 px-4 pb-14 pt-12 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-20">
            <div>
              <p data-hero="badge" className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-line)] bg-[var(--lp-bg-2)] px-3 py-1 text-xs text-[var(--lp-muted)]">
                <Smartphone className="size-3.5 text-[var(--lp-accent)]" aria-hidden="true" /> สำหรับดีลเลอร์ยางโดยเฉพาะ ใช้งานบนมือถือ
              </p>
              <h1 data-hero="title" className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
                <span className="block">ศูนย์รวมยางครบทุกประเภท</span>
                <span className="block text-[var(--lp-accent)]">สั่งได้ใน 60 วินาที</span>
                <span className="block">จากมือถือของคุณ</span>
              </h1>
              <p data-hero="sub" className="mt-5 max-w-md text-base text-[var(--lp-muted)] sm:text-lg">
                ยางรถยนต์ ยางมอเตอร์ไซค์ ยางรถบรรทุก และแบตเตอรี่ จากแบรนด์ชั้นนำ พิมพ์ขนาดเห็นราคาของร้านทันที สั่งซ้ำ 1 ปุ่ม จัดส่งทั่วไทย
              </p>
              <div data-hero="cta" className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href="#search" className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] px-6 py-3.5 text-base font-bold text-[var(--lp-accent-fg)] shadow-lg shadow-[var(--lp-accent)]/30 transition hover:brightness-110 active:scale-[0.98]">
                  <Search className="size-5" aria-hidden="true" /> ค้นหายางตามขนาด
                </a>
                <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--lp-line)] bg-white px-6 py-3.5 text-base font-semibold transition hover:border-[var(--lp-accent)]">
                  เข้าสู่ระบบดีลเลอร์ <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
              </div>
              <dl className="mt-9 grid grid-cols-3 gap-2 sm:gap-3">
                {STATS.map((stat) => (
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
                  <Image src="/landing/hero-tall.webp" alt="ยางรถยนต์ ยางมอเตอร์ไซค์ ยางรถบรรทุก และแบตเตอรี่จากแบรนด์ชั้นนำ" fill priority sizes="(min-width: 768px) 420px, 90vw" className="object-cover object-[50%_18%]" />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[var(--lp-line)] bg-white px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--lp-muted)]">แบรนด์ที่จำหน่าย</p>
                    <p className="text-sm font-bold leading-snug">Bridgestone · Michelin · Yokohama · IRC · GS · 3K</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--lp-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--lp-accent)]">10+ แบรนด์</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SearchPanel sizes={sizeOptions} brands={brandOptions} />

        {/* Trust strip */}
        <section className="border-y border-[var(--lp-line)] bg-white/70" aria-label="จุดเด่นสำหรับดีลเลอร์">
          <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-x-4 gap-y-5 px-4 py-6 md:grid-cols-4">
            {TRUST_POINTS.map((point, i) => {
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

        {/* Brands */}
        <section className="mx-auto max-w-5xl px-4 pt-14" aria-labelledby="brands-heading">
          <div data-reveal className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--lp-accent)]">แบรนด์</p>
              <h2 id="brands-heading" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">แบรนด์ชั้นนำที่ดีลเลอร์สั่งได้ทันที</h2>
            </div>
            <Link href="/tires" className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[var(--lp-accent)] hover:underline sm:inline-flex">
              ดูสินค้าทั้งหมด <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <BrandGrid brands={BRANDS} />
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-5xl px-4 py-16">
          <h2 data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">ครบทุกหมวดที่ร้านยางต้องมี</h2>
          <p data-reveal className="mt-2 max-w-lg text-[var(--lp-muted)]">สั่งได้เฉพาะหมวดที่ร้านของคุณเปิดสิทธิ์ ราคาและสต็อกอัปเดตจากระบบคลังโดยตรง</p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {CATEGORIES.map(({ icon: Icon, label, note }, i) => (
              <li key={label} data-reveal={i * 0.06} className="group rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--lp-accent)]">
                <Icon className="size-7 text-[var(--lp-accent)]" aria-hidden="true" />
                <p className="mt-3 font-bold">{label}</p>
                <p className="text-xs text-[var(--lp-muted)]">{note}</p>
              </li>
            ))}
          </ul>
        </section>

        <CategoryBanners />

        <Promotions items={promotions} />

        {/* Demo */}
        <section className="bg-[var(--lp-bg-2)]/60 px-4 py-16">
          <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
            <div data-reveal>
              <p className="text-sm font-semibold text-[var(--lp-accent)]">ลองเลย</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">ค้นยางคิดเป็นขนาด ไม่ใช่ยี่ห้อ</h2>
              <p className="mt-3 text-[var(--lp-muted)]">ช่องเดียว พิมพ์ขนาดแบบไหนก็หาเจอ ระบบเข้าใจทั้ง 195/65R15, 195 65 15 และ 1956515 แล้วแสดงทุกยี่ห้อที่มีพร้อมราคาและสต็อก</p>
              <ul className="mt-5 space-y-2 text-sm">
                {['เรียงราคาถูกไปแพงอัตโนมัติ', 'เห็นขนาดเดียวกันยี่ห้ออื่นในหน้าสินค้า', 'จำนวนเริ่มต้นเป็นชุด 2 หรือ 4 เส้นตามประเภท'].map((t) => (
                  <li key={t} className="flex items-start gap-2">
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

        {/* Features */}
        <section id="features" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-16">
          <h2 data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">ขายให้ได้มากที่สุด ด้วยขั้นตอนน้อยที่สุด</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }, i) => (
              <li key={title} data-reveal={(i % 3) * 0.08} className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--lp-accent-soft)]">
                  <Icon className="size-5 text-[var(--lp-accent)]" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-1 text-sm text-[var(--lp-muted)]">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-28 bg-[var(--lp-bg-2)]/60 px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <h2 data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">เริ่มใช้งานใน 3 ขั้น</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.n} data-reveal={i * 0.1} className="relative rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5">
                  <span className="text-4xl font-black text-[var(--lp-accent)]/40">{step.n}</span>
                  <h3 className="mt-2 font-bold">{step.title}</h3>
                  <p className="mt-1 text-sm text-[var(--lp-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>

            <div data-reveal className="mt-10 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5">
              <p className="text-sm font-semibold">สถานะออเดอร์ที่เข้าใจง่าย</p>
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

        {/* Testimonials: shown only once real dealer quotes exist (see landing-content.ts). */}
        {publishedTestimonials().length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-16" aria-labelledby="voice-heading">
          <div data-reveal>
            <p className="text-sm font-semibold text-[var(--lp-accent)]">เสียงจากดีลเลอร์</p>
            <h2 id="voice-heading" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">ร้านยางทั่วไทยใช้งานจริง</h2>
          </div>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {publishedTestimonials().map((t, i) => (
              <li key={t.shop} data-reveal={i * 0.08} className="rounded-2xl border border-[var(--lp-line)] bg-white p-5">
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
        <section id="faq" className="scroll-mt-28 bg-[var(--lp-bg-2)]/60 px-4 py-16" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-3xl">
            <h2 id="faq-heading" data-reveal className="text-2xl font-extrabold tracking-tight sm:text-3xl">คำถามที่ดีลเลอร์ถามบ่อย</h2>
            <Faq items={FAQ} />
          </div>
        </section>

        {/* Register */}
        <section id="register" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-16">
          <div data-reveal className="relative overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-gradient-to-br from-[var(--lp-accent-soft)] via-[var(--lp-bg-2)] to-[var(--lp-bg)] p-6 sm:p-10">
            <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">เปิดร้านยาง? สมัครเป็นดีลเลอร์กับเรา</h2>
                <p className="mt-3 text-[var(--lp-muted)]">กรอกข้อมูลร้านสั้นๆ หรือทักมาทาง LINE ทีมงานเปิดสิทธิ์ให้ภายใน 1 วันทำการ ไม่มีค่าสมัคร</p>
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
      </main>

      <LandingFooter />
      <StickyCta />
    </LandingMotion>
  );
}
