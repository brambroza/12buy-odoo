'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogIn, Menu, Phone, Search, X } from 'lucide-react';
import { SITE } from '@/lib/seo';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { BrandLogo } from '@/components/landing/brand-logo';

const CATEGORY_LINKS = (Object.entries(DEALER_TYPE_LABELS) as [DealerType, string][]).map(([value, label]) => ({ href: `/tires?type=${value}`, label }));

const NAV: { href: string; label: string; children?: { href: string; label: string }[] }[] = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/tires', label: 'สินค้า', children: [...CATEGORY_LINKS, { href: '/tires', label: 'ดูแคตตาล็อกทั้งหมด' }] },
  { href: '/#promo', label: 'โปรโมชัน' },
  { href: '/#how', label: 'วิธีสั่งซื้อ' },
  { href: '/#faq', label: 'คำถามที่พบบ่อย' },
  { href: '/#contact', label: 'ติดต่อเรา' },
];

/**
 * Two-tier header modelled on retail tyre sites: a white utility row
 * (logo, size search, phone, sign-up, login) over a red navigation bar with a
 * product dropdown. Collapses to logo + actions + drawer on mobile.
 */
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  // Close the drawer whenever the route changes (derived during render, no effect needed).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const telHref = `tel:${SITE.phone.replace(/-/g, '')}`;

  return (
    <header className="sticky top-0 z-30 shadow-sm">
      {/* Utility row */}
      <div className="border-b border-[var(--lp-line)] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight" aria-label={`${SITE.name} หน้าแรก`}>
            <BrandLogo size={40} />
            <span className="hidden sm:inline">12buy <span className="font-medium text-[var(--lp-muted)]">Dealer</span></span>
          </Link>

          <div className="hidden flex-1 md:block"><HeaderSearch /></div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <a href={telHref} className="hidden items-center gap-1.5 text-sm font-bold text-[var(--lp-fg)] hover:text-[var(--lp-accent)] lg:inline-flex">
              <Phone className="size-4 text-[var(--lp-accent)]" aria-hidden="true" /> โทร {SITE.phone}
            </a>
            <a href={telHref} aria-label={`โทร ${SITE.phone}`} className="flex size-10 items-center justify-center rounded-full border border-[var(--lp-line)] text-[var(--lp-accent)] lg:hidden">
              <Phone className="size-4" aria-hidden="true" />
            </a>
            <Link href="/#register" className="hidden text-sm font-semibold text-[var(--lp-muted)] hover:text-[var(--lp-accent)] md:inline">สมัครดีลเลอร์</Link>
            <Link href="/login" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--lp-accent)] px-3.5 text-sm font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 sm:px-4">
              <LogIn className="size-4" aria-hidden="true" /> เข้าสู่ระบบ
            </Link>
            <button type="button" onClick={() => setOpen(true)} aria-label="เปิดเมนู" aria-expanded={open} className="flex size-10 items-center justify-center rounded-full border border-[var(--lp-line)] md:hidden">
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden"><HeaderSearch compact /></div>
      </div>

      {/* Nav bar */}
      <nav aria-label="เมนูหลัก" className="hidden bg-[var(--lp-accent)] text-[var(--lp-accent-fg)] md:block">
        <ul className="mx-auto flex h-11 max-w-6xl items-stretch px-2">
          {NAV.map((item) => (
            <li key={item.label} className="group relative">
              <Link href={item.href} className="flex h-full items-center gap-1 px-4 text-sm font-semibold transition hover:bg-black/10">
                {item.label}
                {item.children && <ChevronDown className="size-4 transition group-hover:rotate-180 group-focus-within:rotate-180" aria-hidden="true" />}
              </Link>
              {item.children && (
                <ul className="pointer-events-none invisible absolute left-0 top-full z-40 min-w-56 translate-y-1 rounded-b-2xl border border-[var(--lp-line)] bg-white py-2 text-[var(--lp-fg)] opacity-0 shadow-xl transition group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                  {item.children.map((child) => (
                    <li key={child.href}>
                      <Link href={child.href} onClick={(e) => e.currentTarget.blur()} className="block px-4 py-2 text-sm hover:bg-[var(--lp-accent-soft)] hover:text-[var(--lp-accent)]">{child.label}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <button type="button" aria-label="ปิดเมนู" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 right-0 flex w-[84%] max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-[var(--lp-line)] px-4">
              <span className="flex items-center gap-2 font-extrabold"><BrandLogo size={32} /> 12buy Dealer</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="ปิดเมนู" className="flex size-10 items-center justify-center rounded-full border border-[var(--lp-line)]"><X className="size-5" aria-hidden="true" /></button>
            </div>
            <ul className="flex-1 overflow-y-auto py-2">
              {NAV.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="block px-5 py-3 font-semibold">{item.label}</Link>
                  {item.children && (
                    <ul className="mb-2 border-l-2 border-[var(--lp-accent-soft)] ml-5">
                      {item.children.map((child) => (
                        <li key={child.href}><Link href={child.href} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-[var(--lp-muted)]">{child.label}</Link></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-[var(--lp-line)] p-4">
              <Link href="/login" onClick={() => setOpen(false)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] font-bold text-[var(--lp-accent-fg)]"><LogIn className="size-4" aria-hidden="true" /> เข้าสู่ระบบดีลเลอร์</Link>
              <Link href="/#register" onClick={() => setOpen(false)} className="flex h-11 items-center justify-center rounded-full border border-[var(--lp-line)] font-semibold">สมัครดีลเลอร์</Link>
              <a href={telHref} className="flex items-center justify-center gap-2 pt-1 text-sm text-[var(--lp-muted)]"><Phone className="size-4 text-[var(--lp-accent)]" aria-hidden="true" /> {SITE.phone}</a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/** Compact size search that lands on the public catalog. */
function HeaderSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  return (
    <form
      role="search"
      aria-label="ค้นหาขนาดยาง"
      onSubmit={(e) => { e.preventDefault(); const q = value.trim(); if (q) router.push(`/tires/search?q=${encodeURIComponent(q)}`); }}
      className={`flex w-full items-center overflow-hidden rounded-full border border-[var(--lp-line)] bg-[var(--lp-bg-2)]/70 focus-within:border-[var(--lp-accent)] focus-within:bg-white ${compact ? 'h-10' : 'h-11 max-w-xl'}`}
    >
      <Search className="ml-4 size-4 shrink-0 text-[var(--lp-muted)]" aria-hidden="true" />
      <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="search" enterKeyHint="search" autoComplete="off" placeholder="ค้นหาขนาดยาง เช่น 195/65R15 หรือ 1956515" aria-label="ขนาดยาง" className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[var(--lp-muted)]" />
      <button type="submit" className="mr-1 h-8 shrink-0 rounded-full bg-[var(--lp-fg)] px-4 text-xs font-bold text-white transition hover:bg-[var(--lp-accent)]">ค้นหา</button>
    </form>
  );
}
