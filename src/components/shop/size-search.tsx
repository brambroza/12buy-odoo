'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const HINTS = ['195/65R15', '215/70R15C', '11R22.5', '80/90-17'];

/**
 * Primary search box: type a tire size and land on results.
 * `basePath` lets the public catalog reuse it (`/tires/search`) without duplicating the component.
 */
export function SizeSearch({ initial = '', autoFocus = false, basePath = '/shop/search' }: { initial?: string; autoFocus?: boolean; basePath?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const go = (q: string) => router.push(`${basePath}?q=${encodeURIComponent(q.trim())}`);
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
        <Button type="submit" className="h-12 px-5">ค้นหา</Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {HINTS.map((hint) => (
          <button key={hint} type="button" onClick={() => { setValue(hint); go(hint); }} className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}
