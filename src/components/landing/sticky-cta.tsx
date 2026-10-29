'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, MessageCircle } from 'lucide-react';
import { SITE } from '@/lib/seo';

/**
 * Mobile bottom bar (LINE + login) that appears once the hero scrolls away,
 * plus a floating LINE button on desktop. `sentinelId` is the element whose
 * exit from the viewport reveals the bar.
 */
export function StickyCta({ sentinelId = 'hero' }: { sentinelId?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(sentinelId);
    if (!target || typeof IntersectionObserver === 'undefined') {
      // No sentinel to watch: show the bar after first paint.
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { rootMargin: '-56px 0px 0px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [sentinelId]);

  const lineHref = `https://line.me/R/ti/p/${encodeURIComponent(SITE.lineId)}`;

  return (
    <>
      <div
        aria-hidden={!visible}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-[var(--lp-line)] bg-white/95 p-2 backdrop-blur transition-transform duration-300 md:hidden ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <a href={lineHref} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-bold text-white">
            <MessageCircle className="size-4" aria-hidden="true" /> ทัก LINE
          </a>
          <Link href="/login" className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] py-3 text-sm font-bold text-[var(--lp-accent-fg)]">
            <LogIn className="size-4" aria-hidden="true" /> เข้าสู่ระบบ
          </Link>
        </div>
      </div>
      <a
        href={lineHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`ทัก LINE ${SITE.lineId}`}
        className="fixed bottom-6 right-6 z-40 hidden size-14 items-center justify-center rounded-full bg-[#06C755] text-white shadow-xl shadow-black/20 transition hover:scale-105 md:flex"
      >
        <MessageCircle className="size-7" aria-hidden="true" />
      </a>
    </>
  );
}
