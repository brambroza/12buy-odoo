import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

/**
 * Security headers for every response. CSP runs in report-only mode first: Next.js hydration and
 * GSAP use inline scripts, product images come from the Odoo host, and Turnstile loads from Cloudflare,
 * so the policy is tuned from the reports before it is enforced (set CSP_ENFORCE=true to switch).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: process.env.CSP_ENFORCE === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', value: csp },
];

const nextConfig: NextConfig = {
  // A stray ~/yarn.lock makes Next infer the home folder as the workspace root.
  turbopack: { root: __dirname },
  // Slip uploads go through a server action; default limit is 1 MB. Server side still caps files at 5 MB.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

/** Sentry build plugin (source maps) only when a token is present; the runtime SDK works without it. */
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, { org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, silent: true, widenClientFileUpload: true })
  : nextConfig;
