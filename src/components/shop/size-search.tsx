'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const HINTS = ['195/65R15', '215/70R15C', '11R22.5', '80/90-17'];

/**
 * Primary search box: type a tire size and land on results.
 * `basePath` lets the public catalog reuse it (`/tires/search`) without duplicating the component.
 * The box follows `initial` when the URL changes (chips, bottom nav, back button) and shows a spinner
 * while the results page renders; searching the size already shown re-fetches instead of doing nothing.
 */
export function SizeSearch({ initial = '', autoFocus = false, basePath = '/shop/search' }: { initial?: string; autoFocus?: boolean; basePath?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [pending, startTransition] = useTransition();
  if (initial !== shown) { setShown(initial); setValue(initial); }
  const go = (q: string) => startTransition(() => {
    const query = q.trim();
    const here = new URL(window.location.href);
    if (here.pathname === basePath && (here.searchParams.get('q') ?? '').trim() === query) router.refresh();
    else router.push(`${basePath}?q=${encodeURIComponent(query)}`);
  });
  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(value); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus={autoFocus}
            inputMode="search"
            enterKeyHint="search"
            placeholder="พิมพ์ขนาดยาง เช่น 195/65R15"
            className="h-12 pl-10 text-base"
            aria-label="ค้นหาขนาดยาง"
          />
        </div>
        <Button type="submit" disabled={pending} className="h-12 px-5">{pending ? <><Loader2 className="size-4 animate-spin" /> กำลังค้นหา</> : 'ค้นหา'}</Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {HINTS.map((hint) => (
          <button key={hint} type="button" disabled={pending} onClick={() => { setValue(hint); go(hint); }} className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}
