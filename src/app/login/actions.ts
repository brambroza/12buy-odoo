'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { verifyPassword } from '@/lib/auth/password';
import { homeFor, type Role } from '@/lib/auth/roles';
import { createSession, destroySession } from '@/lib/auth/session';
import { findUserByEmail, updateUser } from '@/lib/auth/users';
import { allowOdooLogin, provisionFromOdooLogin } from '@/lib/dealers/from-odoo';
import { findOpenLeadByEmail } from '@/lib/leads/repo';
import { safeNext } from '@/lib/safe-next';
import { RATE_LIMITS, clientIp, hitRateLimit, retryHint } from '@/lib/security/rate-limit';
import { flash } from '@/lib/flash';

export type LoginResult = { ok: false; message: string } | null;

const schema = z.object({
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรอกรหัสผ่าน'),
  next: z.string().optional(),
  remember: z.boolean(),
});

const GENERIC = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';

/** Email + password sign-in for dealers and staff. Redirects on success. */
export async function loginAction(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  const parsed = schema.safeParse({ email: formData.get('email'), password: formData.get('password'), next: formData.get('next') ?? undefined, remember: formData.get('remember') === 'on' });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };

  // Brute-force guard: a wide window per IP (shared office NAT) and a tight one per email.
  const ip = clientIp(await headers());
  const email = parsed.data.email.toLowerCase();
  const [byIp, byEmail] = await Promise.all([hitRateLimit('login-ip', ip, RATE_LIMITS.loginIp), hitRateLimit('login-email', email, RATE_LIMITS.loginEmail)]);
  if (!byIp.ok || !byEmail.ok) {
    const blocked = byEmail.ok ? byIp : byEmail;
    await audit(null, 'login.rate_limited', 'User', email, { ip: ip.slice(0, 64), scope: byEmail.ok ? 'ip' : 'email', count: blocked.count });
    return { ok: false, message: `พยายามเข้าสู่ระบบบ่อยเกินไป ${retryHint(blocked.retryAfterMs)} หรือกด "ลืมรหัสผ่าน"` };
  }

  let user = await findUserByEmail(parsed.data.email);
  if (!user) {
    // A shop that signed up but is not approved yet: say so instead of "wrong password".
    const lead = await findOpenLeadByEmail(parsed.data.email);
    if (lead?.passwordHash && verifyPassword(parsed.data.password, lead.passwordHash)) return { ok: false, message: 'ใบสมัครของร้านอยู่ระหว่างตรวจสอบ ทีมงานจะติดต่อกลับภายใน 1 วันทำการ' };
    const odoo = await tryOdooLogin(parsed.data.email, parsed.data.password);
    if (odoo && 'message' in odoo) return odoo;
    if (odoo) user = odoo;
  }
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    await audit(user?.id ?? null, 'login.failed', 'User', user?.id ?? parsed.data.email.toLowerCase());
    return { ok: false, message: GENERIC };
  }
  if (!user.isActive) return { ok: false, message: 'บัญชีนี้ถูกปิดการใช้งาน ติดต่อแอดมิน' };
  if (user.dealer && user.dealer.status !== 'ACTIVE' && (user.role === 'DEALER_OWNER' || user.role === 'DEALER_STAFF')) {
    return { ok: false, message: user.dealer.status === 'PENDING' ? 'ร้านของคุณรออนุมัติ ทีมงานจะติดต่อกลับภายใน 1 วันทำการ' : 'ร้านของคุณถูกระงับ ติดต่อฝ่ายขาย' };
  }

  await createSession(user.id, { remember: parsed.data.remember });
  await updateUser(user.id, { lastLoginAt: new Date() });
  await audit(user.id, 'login', 'User', user.id);
  await flash(`ยินดีต้อนรับ ${user.name}`, { icon: 'login', description: user.mustChangePassword ? 'ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน' : 'เข้าสู่ระบบสำเร็จ' });

  if (user.mustChangePassword) redirect(`/account/password?next=${encodeURIComponent(safeNext(parsed.data.next, homeFor(user.role as Role)))}`);
  redirect(safeNext(parsed.data.next, homeFor(user.role as Role)));
}

/**
 * No web account yet: an Odoo portal user may sign in with their Odoo email + password, which creates
 * their dealer and web login on the spot. Returns the new user, an error to show, or null to fall
 * through to the generic "wrong email or password".
 */
async function tryOdooLogin(email: string, password: string): Promise<Awaited<ReturnType<typeof findUserByEmail>> | { ok: false; message: string } | null> {
  const ip = clientIp(await headers());
  if (!(await allowOdooLogin(ip))) return null;
  try {
    const outcome = await provisionFromOdooLogin(email, password);
    if (outcome.kind === 'invalid') return null;
    if (outcome.kind === 'not-portal') return { ok: false, message: 'บัญชี Odoo นี้ไม่ใช่บัญชีลูกค้า ติดต่อแอดมิน' };
    if (outcome.kind === 'conflict') {
      await audit(null, 'login.odoo_conflict', 'Dealer', outcome.dealer.id, { odooUid: outcome.odooUid, email, ip: ip.slice(0, 64) });
      return { ok: false, message: 'ร้านของคุณมีบัญชีบนเว็บอยู่แล้ว ขอให้เจ้าของร้านเพิ่มผู้ใช้ให้ หรือทัก LINE ให้ทีมงานช่วย' };
    }
    await audit(outcome.user.id, 'login.odoo_provision', 'User', outcome.user.id, { dealerId: outcome.dealer.id, odooUid: outcome.odooUid, newDealer: outcome.newDealer, role: outcome.user.role, ip: ip.slice(0, 64) });
    return findUserByEmail(email);
  } catch (error) {
    console.error('[login] odoo sign-in failed', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Signs out and returns to the landing page. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  await flash('ออกจากระบบแล้ว', { type: 'info', icon: 'logout', description: 'แล้วพบกันใหม่' });
  redirect('/');
}
