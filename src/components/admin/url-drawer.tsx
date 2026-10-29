'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

gsap.registerPlugin(useGSAP);

/** Drawer body whose sections slide in one after another when the drawer opens (skipped for reduced motion). */
function DrawerBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      if (!ref.current) return;
      gsap.from(ref.current.children, { x: 18, opacity: 0, duration: 0.4, delay: 0.08, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
    });
    return () => mm.revert();
  }, { scope: ref });
  return <div ref={ref} className="space-y-4 p-4">{children}</div>;
}

const WIDTH = { md: 'data-[side=right]:sm:max-w-2xl', lg: 'data-[side=right]:sm:max-w-4xl', xl: 'data-[side=right]:sm:max-w-6xl' } as const;

/**
 * Right-side drawer whose open state lives in the URL: the server renders it only for the open row
 * (e.g. `?open=<id>`), and closing it navigates to `closeHref` (the same list without that param).
 * Server-action forms inside keep working; their redirect back to `?open=<id>` reopens the drawer.
 */
export function UrlDrawer({ title, description, closeHref, size = 'md', children }: { title: ReactNode; description?: ReactNode; closeHref: string; size?: keyof typeof WIDTH; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.replace(closeHref, { scroll: false });
      }}
    >
      <SheetContent side="right" className={cn('w-full gap-0 overflow-y-auto data-[side=right]:w-full', WIDTH[size])}>
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <DrawerBody>{children}</DrawerBody>
      </SheetContent>
    </Sheet>
  );
}
