'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { POPULAR_SIZES } from '@/lib/landing-content';
import { normalizeSizeQuery } from '@/lib/shop/size';

/**
 * Hero search box: type a tyre size (or just the digits) and jump to the public
 * catalog results. Mirrors the "ค้นหายางตามขนาด" entry point competitors lead with.
 */
export function HeroSizeFinder({ basePath = '/tires/search' }: { basePath?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (raw: string) => {
    const query = raw.trim();
    if (!normalizeSizeQuery(query)) {
      setError('พิมพ์ขนาดยาง เช่น 195/65R15 หรือ 1956515');
      return;
    }
    setError(null);
    router.push(`${basePath}?q=${encodeURIComponent(query)}`);
  };

  return (
    <div data-hero="cta" className="mt-7">
      <form
        role="search"
        aria-label="ค้นหายางตามขนาด"
        onSubmit={(e) => { e.preventDefault(); go(value); }}
        className="flex flex-col gap-2 rounded-2xl border border-[var(--lp-line)] bg-white p-2 shadow-xl shadow-[var(--lp-accent)]/10 sm:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">ขนาดยาง</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[var(--lp-muted)]" aria-hidden="true" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="พิมพ์ขนาดยาง เช่น 195/65R15"
            aria-invalid={error ? true : undefined}
            className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-base outline-none placeholder:text-[var(--lp-muted)]"
          />
        </label>
        <button type="submit" className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--lp-accent)] px-6 text-base font-bold text-[var(--lp-accent-fg)] transition hover:brightness-110 active:scale-[0.98]">
          ค้นหายาง
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-[var(--lp-accent)]">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-[var(--lp-muted)]">ยอดนิยม</span>
        {POPULAR_SIZES.map((size) => (
          <button key={size} type="button" onClick={() => { setValue(size); go(size); }} className="rounded-full border border-[var(--lp-line)] bg-white px-3 py-1 font-mono text-xs text-[var(--lp-fg)] transition hover:border-[var(--lp-accent)] hover:text-[var(--lp-accent)]">
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}
