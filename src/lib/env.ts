import { z } from 'zod';

/**
 * Environment contract. `validateEnv()` runs once at server start (see `instrumentation.ts`):
 * it throws for variables the app cannot run without and logs the rest, so a misconfigured deploy
 * fails loudly instead of 500-ing on the first request or quietly using localhost URLs.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  ODOO_READ_ONLY: z.enum(['true', 'false']).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  SETTINGS_SECRET: z.string().min(32).optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

/** Problems that do not stop the server but will bite in production. */
export function envWarnings(env: Partial<Env>): string[] {
  const warnings: string[] = [];
  if (env.NODE_ENV !== 'production') return warnings;
  if (!env.NEXT_PUBLIC_SITE_URL) warnings.push('NEXT_PUBLIC_SITE_URL ว่าง: canonical/sitemap/OG จะชี้ไป localhost');
  if (!env.CRON_SECRET) warnings.push('CRON_SECRET ว่างหรือสั้นกว่า 16 ตัว: cron ดึงสถานะจาก Odoo จะถูกปฏิเสธ');
  if (!env.TURNSTILE_SECRET_KEY) warnings.push('TURNSTILE_SECRET_KEY ว่าง: ฟอร์มสมัครดีลเลอร์จะปฏิเสธทุกคำขอ');
  if (!env.SETTINGS_SECRET) warnings.push('SETTINGS_SECRET ว่าง: ใช้คีย์ที่ derive จาก service role key แทน (หมุนคีย์แล้ว API key ที่บันทึกไว้จะอ่านไม่ได้)');
  if (!env.SENTRY_DSN) warnings.push('SENTRY_DSN ว่าง: ไม่มีการส่ง error ไป Sentry');
  if (env.ODOO_READ_ONLY !== 'false') warnings.push('ODOO_READ_ONLY ไม่ใช่ false: ออเดอร์จะไม่ถูกส่งเข้า Odoo');
  return warnings;
}

/**
 * Parses `process.env`. Throws on a missing Supabase connection (nothing works without it);
 * other problems are returned as warnings for the caller to log.
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): { env: Env; warnings: string[] } {
  const clean = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]));
  const parsed = schema.safeParse(clean);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return { env: parsed.data, warnings: envWarnings(parsed.data) };
}
