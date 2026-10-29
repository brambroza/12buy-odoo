import Link from 'next/link';
import { ChevronRight, LogIn } from 'lucide-react';
import { PublicProductCard } from '@/components/landing/public-product-card';
import type { PublicProduct } from '@/lib/shop/public-catalog';

/** Visual breadcrumb (JSON-LD is emitted separately by each page). */
export function Crumbs({ crumbs }: { crumbs: readonly { name: string; path: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-[var(--lp-muted)]">
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
          {i === crumbs.length - 1 ? <span aria-current="page" className="text-[var(--lp-fg)]">{crumb.name}</span> : <Link href={crumb.path} className="hover:text-[var(--lp-fg)]">{crumb.name}</Link>}
        </span>
      ))}
    </nav>
  );
}

/** Shown when Odoo is unreachable at render time. */
export function CatalogUnavailable() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--lp-line)] bg-white p-8 text-center text-sm text-[var(--lp-muted)]">
      ขณะนี้ดึงรายการสินค้าไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง หรือทัก LINE เพื่อสอบถามขนาดที่ต้องการ
    </div>
  );
}

/** Result grid plus the login banner that replaces prices on public pages. */
export function PublicResults({ items, emptyHint, loginNext = '/shop' }: { items: PublicProduct[]; emptyHint: string; loginNext?: string }) {
  if (items.length === 0) {
    return <div className="rounded-2xl border border-dashed border-[var(--lp-line)] bg-white p-8 text-center text-sm text-[var(--lp-muted)]">{emptyHint}</div>;
  }
  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-accent-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="font-bold">ราคาดีลเลอร์แสดงหลังเข้าสู่ระบบ</span>
          <span className="text-[var(--lp-muted)]"> ราคาต่างกันตามระดับร้านและโซนจัดส่ง</span>
        </p>
        <Link href={`/login?next=${encodeURIComponent(loginNext)}`} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--lp-accent)] px-4 py-2 text-sm font-bold text-[var(--lp-accent-fg)] hover:brightness-110">
          <LogIn className="size-4" aria-hidden="true" /> เข้าสู่ระบบดูราคา
        </Link>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((product) => <li key={product.id}><PublicProductCard product={product} /></li>)}
      </ul>
    </>
  );
}
