import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { isPromotionActive, type Promotion } from '@/lib/landing-content';

const thaiDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

/** Current promotions. Prices are never shown publicly; cards push dealers to log in. */
export function Promotions({ items }: { items: readonly Promotion[] }) {
  const active = items.filter((p) => isPromotionActive(p));
  if (active.length === 0) return null;
  return (
    <section id="promo" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-16" aria-labelledby="promo-heading">
      <div data-reveal>
        <p className="text-sm font-semibold text-[var(--lp-accent)]">โปรโมชัน</p>
        <h2 id="promo-heading" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">ราคาพิเศษดีลเลอร์เดือนนี้</h2>
        <p className="mt-2 max-w-lg text-[var(--lp-muted)]">ราคาโปรโมชันแสดงตามสิทธิ์ของร้านหลังเข้าสู่ระบบ</p>
      </div>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {active.map((promo, i) => (
          <li key={promo.title} data-reveal={i * 0.08}>
            <Link href={promo.href} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-white shadow-lg shadow-[var(--lp-accent)]/10 transition hover:-translate-y-1">
              <div className="relative aspect-[16/9]">
                <Image src={promo.image} alt="" fill sizes="(min-width: 768px) 340px, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--lp-muted)]">
                  <CalendarDays className="size-3.5" aria-hidden="true" /> {thaiDate.format(new Date(promo.from))} – {thaiDate.format(new Date(promo.to))}
                </p>
                <h3 className="mt-1.5 font-bold leading-snug">{promo.title}</h3>
                <p className="mt-1 flex-1 text-sm text-[var(--lp-muted)]">{promo.body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--lp-accent)]">ดูสินค้า <ArrowRight className="size-4" aria-hidden="true" /></span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
