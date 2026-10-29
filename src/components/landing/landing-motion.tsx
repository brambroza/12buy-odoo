'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Wraps the landing page and wires all GSAP motion from data attributes, so the
 * sections themselves stay server-rendered (good for SEO) while still animating:
 * - `data-hero="badge|title|sub|cta|art"`: intro timeline on load
 * - `data-tire`: rotates with page scroll (optional decorative element)
 * - `data-reveal`: fades/slides in when scrolled into view
 * - `data-counter="1200"`: counts up from 0 when visible
 * Honours `prefers-reduced-motion` by skipping every tween.
 */
export function LandingMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('[data-hero="badge"]', { y: 16, opacity: 0, duration: 0.5 })
          .from('[data-hero="title"] > span', { y: 44, opacity: 0, duration: 0.8, stagger: 0.09 }, '-=0.25')
          .from('[data-hero="sub"]', { y: 20, opacity: 0, duration: 0.6 }, '-=0.45')
          .from('[data-hero="cta"] > *', { y: 16, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.35')
          .from('[data-hero="art"]', { y: 36, scale: 0.94, opacity: 0, duration: 1.1, ease: 'expo.out' }, 0.15)
          .from('[data-hero="stat"]', { y: 12, opacity: 0, duration: 0.5, stagger: 0.08 }, '-=0.8');

        if (scope.current?.querySelector('[data-tire]')) gsap.to('[data-tire]', {
          rotate: 540,
          ease: 'none',
          scrollTrigger: { trigger: scope.current, start: 'top top', end: 'bottom bottom', scrub: 1.2 },
        });

        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
          const delay = Number(el.dataset.reveal) || 0;
          gsap.fromTo(
            el,
            { opacity: 0, y: 28 },
            { opacity: 1, y: 0, duration: 0.75, delay, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } },
          );
        });

        gsap.utils.toArray<HTMLElement>('[data-counter]').forEach((el) => {
          const target = Number(el.dataset.counter) || 0;
          const state = { value: 0 };
          el.textContent = '0';
          gsap.to(state, {
            value: target,
            duration: 1.5,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
            onUpdate: () => {
              el.textContent = Math.round(state.value).toLocaleString('th-TH');
            },
          });
        });

      });
    },
    { scope },
  );

  return (
    <div ref={scope} className="landing min-h-screen overflow-x-hidden">
      {children}
    </div>
  );
}
