import * as Sentry from '@sentry/nextjs';

/** Node runtime. Without SENTRY_DSN the SDK stays dormant, so local dev needs no account. */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  enabled: Boolean(process.env.SENTRY_DSN),
});
