/**
 * Tiny structured logger: one JSON line per event in production (easy to grep in Vercel / Datadog),
 * readable `[module] message {…}` in development. Levels: debug < info < warn < error;
 * `LOG_LEVEL` picks the floor (default `info`, `debug` in development).
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function floor(): number {
  const raw = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')) as Level;
  return ORDER[raw] ?? ORDER.info;
}

function serializeError(error: unknown): Fields {
  if (error instanceof Error) return { error: error.message, stack: process.env.NODE_ENV === 'production' ? undefined : error.stack };
  return { error: String(error) };
}

function write(level: Level, module: string, message: string, fields?: Fields) {
  if (ORDER[level] < floor()) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (process.env.NODE_ENV === 'production') {
    sink(JSON.stringify({ level, module, message, ...fields, at: new Date().toISOString() }));
  } else {
    sink(`[${module}] ${message}`, fields && Object.keys(fields).length ? fields : '');
  }
}

export type Logger = {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  /** Pass the caught value as `error`; it is flattened to `error` (+ `stack` outside production). */
  error(message: string, fields?: Fields & { error?: unknown }): void;
};

/** Logger bound to a module name, e.g. `logger('odoo')`. */
export function logger(module: string): Logger {
  return {
    debug: (m, f) => write('debug', module, m, f),
    info: (m, f) => write('info', module, m, f),
    warn: (m, f) => write('warn', module, m, f),
    error: (m, f) => write('error', module, m, f && 'error' in f ? { ...f, ...serializeError(f.error) } : f),
  };
}
