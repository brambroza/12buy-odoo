import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { pageWindow, type Page } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

/**
 * GET search form for a list page. `keep` carries the current filters (status, tab, …) so a search does not
 * reset them; the page number is dropped on purpose so results start at page 1.
 */
export function ListSearch({ action, q, placeholder, keep = {}, clearHref, children }: {
  action: string; q?: string; placeholder: string; keep?: Record<string, string | undefined>; clearHref?: string; children?: ReactNode;
}) {
  return (
    <form action={action} role="search" className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      {Object.entries(keep).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" type="search" defaultValue={q} placeholder={placeholder} aria-label={placeholder} className="h-9 w-full pl-8 sm:w-64" />
      </div>
      {children}
      <Button type="submit" variant="outline" size="sm" className="h-9">ค้นหา</Button>
      {clearHref && <Button variant="ghost" size="icon-sm" className="size-9" title="ล้างการค้นหา" aria-label="ล้างการค้นหา" nativeButton={false} render={<Link href={clearHref} />}><X /></Button>}
    </form>
  );
}

/** "แสดง 21–40 จาก 95" plus previous / numbered / next page links. Renders the count only when there is one page. */
export function ListPagination({ page, href, unit = 'รายการ' }: { page: Page<unknown>; href: (page: number) => string; unit?: string }) {
  const link = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border px-2 text-xs tabular-nums';
  return (
    <nav aria-label="เลือกหน้า" className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{page.total === 0 ? `ไม่มี${unit}` : `แสดง ${page.from}–${page.to} จาก ${page.total} ${unit}`}</span>
      {page.pageCount > 1 && (
        <span className="flex items-center gap-1">
          {page.page > 1
            ? <Link href={href(page.page - 1)} scroll={false} className={cn(link, 'hover:bg-muted')} aria-label="หน้าก่อน" title="หน้าก่อน"><ChevronLeft className="size-4" /></Link>
            : <span className={cn(link, 'opacity-40')} aria-hidden><ChevronLeft className="size-4" /></span>}
          {pageWindow(page.page, page.pageCount).map((n, i) => n === null
            ? <span key={`gap-${i}`} className="px-1">…</span>
            : <Link key={n} href={href(n)} scroll={false} aria-current={n === page.page ? 'page' : undefined}
                className={cn(link, n === page.page ? 'border-primary bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}>{n}</Link>)}
          {page.page < page.pageCount
            ? <Link href={href(page.page + 1)} scroll={false} className={cn(link, 'hover:bg-muted')} aria-label="หน้าถัดไป" title="หน้าถัดไป"><ChevronRight className="size-4" /></Link>
            : <span className={cn(link, 'opacity-40')} aria-hidden><ChevronRight className="size-4" /></span>}
        </span>
      )}
    </nav>
  );
}

/** Icon-only link button with a tooltip (`title`) and an accessible name. */
export function IconLink({ href, label, children, className, scroll = false }: { href: string; label: string; children: ReactNode; className?: string; scroll?: boolean }) {
  return (
    <Button variant="ghost" size="icon-sm" title={label} aria-label={label} className={cn('transition-transform active:scale-90', className)} nativeButton={false} render={<Link href={href} scroll={scroll} />}>
      {children}
    </Button>
  );
}

/** Pill filter link (status tabs above a list). */
export function FilterChip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'true' : undefined}
      className={cn('rounded-full border px-3 py-1 text-xs font-medium', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
      {children}
    </Link>
  );
}

/** Full-width "nothing found" row for a table body. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <TableRow><TableCell colSpan={colSpan} className="p-6 text-center whitespace-normal text-muted-foreground">{children}</TableCell></TableRow>;
}

/** Bordered card that holds a table. `rt` turns the table into labelled cards on phones (see globals.css). */
export function TableCard({ children }: { children: ReactNode }) {
  return <div className="rt overflow-hidden rounded-xl border border-border bg-card">{children}</div>;
}
