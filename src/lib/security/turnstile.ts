/**
 * Cloudflare Turnstile (bot check) — server-side verification of the widget token.
 * Keys: NEXT_PUBLIC_TURNSTILE_SITE_KEY (widget) and TURNSTILE_SECRET_KEY (this check).
 * Without a secret the check is skipped outside production and refused in production (fail closed).
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

export async function verifyTurnstile(token: string | null | undefined, remoteIp?: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[turnstile] TURNSTILE_SECRET_KEY is not set; refusing sign-ups');
      return { ok: false, reason: 'ระบบตรวจสอบยังไม่พร้อม กรุณาทัก LINE แทน' };
    }
    return { ok: true };
  }
  if (!token || token.length > 2048) return { ok: false, reason: 'กรุณายืนยันว่าไม่ใช่บอท แล้วกดส่งอีกครั้ง' };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true };
    console.warn('[turnstile] rejected', data['error-codes']);
    return { ok: false, reason: 'ยืนยันตัวตนไม่ผ่าน กรุณาลองใหม่' };
  } catch (error) {
    console.error('[turnstile] verify failed', error instanceof Error ? error.message : error);
    return { ok: false, reason: 'ตรวจสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  }
}
