import * as Sentry from '@sentry/nextjs';

/** Runs once per server start: validate env, start Sentry for the Node and Edge runtimes. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env');
    const { logger } = await import('@/lib/logger');
    const log = logger('env');
    try {
      const { warnings } = validateEnv();
      for (const warning of warnings) log.warn(warning);
    } catch (error) {
      // Tests and `next build` may run without a .env; only a running production server must stop.
      if (process.env.NODE_ENV === 'production') throw error;
      log.warn(error instanceof Error ? error.message : String(error));
    }
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

/** Reports errors thrown in React Server Components, route handlers and server actions. */
export const onRequestError = Sentry.captureRequestError;
