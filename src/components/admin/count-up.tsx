'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

const FORMAT = {
  baht: (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`,
  number: (n: number) => Math.round(n).toLocaleString('th-TH'),
} as const;

/**
 * A number that counts up from 0 when it first appears. The final value is server-rendered, so it is
 * correct without JavaScript and for reduced motion (no count-up then).
 */
export function CountUp({ value, format = 'number', className }: { value: number; format?: keyof typeof FORMAT; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const state = { n: 0 };
      gsap.to(state, {
        n: value, duration: 1.1, ease: 'power2.out',
        onUpdate: () => { el.textContent = FORMAT[format](state.n); },
        onComplete: () => { el.textContent = FORMAT[format](value); },
      });
      return () => { el.textContent = FORMAT[format](value); };
    });
    return () => mm.revert();
  }, { dependencies: [value, format] });
  return <span ref={ref} className={className}>{FORMAT[format](value)}</span>;
}
