'use client';

import { useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** URL params that only open/close a drawer or show a one-off banner; changing them must not replay the list motion. */
const DRAWER_PARAMS = new Set(['open', 'edit', 'new', 'group', 'program', 'book', 'pairs', 'partner', 'cpage', 'saved', 'error', 'info', 'unknown', 'imported', 'submitted', 'published', 'rejected', 'dryrun', 'fromLead']);

/** The part of the URL that changes what the list shows (path + search/filter/page), ignoring drawer params. */
function listKey(pathname: string, params: URLSearchParams): string {
  const kept = [...params.entries()].filter(([key]) => !DRAWER_PARAMS.has(key)).sort(([a], [b]) => a.localeCompare(b));
  return `${pathname}?${new URLSearchParams(kept).toString()}`;
}

/**
 * Motion for back-office pages, applied from the outside so pages stay plain server components:
 * - a new page: its top-level blocks (title, toolbar, banners, table) rise in one after another;
 * - a new search / filter / page on the same list: only the table rows cascade in;
 * - opening or closing a drawer changes nothing here (the drawer animates itself).
 * Skipped entirely when the user prefers reduced motion.
 */
export function AdminMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = listKey(pathname, new URLSearchParams(searchParams.toString()));
  const last = useRef<{ pathname: string; key: string } | null>(null);

  useGSAP(() => {
    const previous = last.current;
    last.current = { pathname, key };
    if (previous?.key === key) return;
    const samePage = previous?.pathname === pathname;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const root = scope.current?.firstElementChild;
      if (!root) return;
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (!samePage) {
        tl.from(root.children, { y: 14, opacity: 0, duration: 0.45, stagger: 0.06, clearProps: 'transform,opacity' });
      }
      const rows = gsap.utils.toArray<HTMLElement>('[data-slot="table-body"] > tr', root).slice(0, 40);
      if (rows.length) {
        tl.from(rows, { y: 8, opacity: 0, duration: 0.35, stagger: 0.025, clearProps: 'transform,opacity' }, samePage ? 0 : 0.15);
      }
    });
    return () => mm.revert();
  }, { dependencies: [key, pathname], scope });

  return <div ref={scope} className="w-full min-w-0">{children}</div>;
}
