import * as Sentry from '@sentry/nextjs';

/** Edge runtime (`src/proxy.ts`). */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  enabled: Boolean(process.env.SENTRY_DSN),
});
