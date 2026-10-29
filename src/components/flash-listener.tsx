'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { notify } from '@/components/ui/notify';
import { decodeFlash, FLASH_COOKIE } from '@/lib/flash-shared';

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

/** Flash ids already shown, so a cookie read twice in a race never toasts twice. */
const shown = new Set<string>();

/** Shows the toast a server action queued with `flash()` (once) and clears the cookie. */
function consumeFlash() {
  const raw = readCookie(FLASH_COOKIE);
  if (!raw) return;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
  const flash = decodeFlash(raw);
  if (!flash || shown.has(flash.id)) return;
  shown.add(flash.id);
  notify.show(flash.type, flash.title, { id: flash.id, description: flash.description, icon: flash.icon });
}

/**
 * Bridges server-action results to toasts. Actions either redirect (new route) or only revalidate (same URL),
 * so besides route changes it checks on a light interval (reading one cookie; no network).
 */
export function FlashListener() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const interval = window.setInterval(consumeFlash, 600);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    consumeFlash();
  }, [pathname, search]);

  return null;
}
