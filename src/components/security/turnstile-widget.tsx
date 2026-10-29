'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
    __turnstileLoading?: Promise<void>;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Loads the Turnstile script once per page. */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__turnstileLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile script failed'));
    document.head.appendChild(script);
  });
  return window.__turnstileLoading;
}

/**
 * Cloudflare Turnstile bot check. Renders into the surrounding <form> a hidden
 * `cf-turnstile-response` input that the server action verifies.
 * Bump `resetKey` after each failed submit: a token can be verified only once.
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set (local development).
 */
export function TurnstileWidget({ resetKey = 0 }: { resetKey?: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(box.current, { sitekey: siteKey, language: 'th', theme: 'light', action: 'dealer-signup' });
      })
      .catch(() => { /* the server rejects the submit and the user sees why */ });
    return () => {
      alive = false;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
