'use server';

import { flash } from '@/lib/flash';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { passwordProblem } from '@/lib/auth/password';
import { homeFor } from '@/lib/auth/roles';
import { createSession } from '@/lib/auth/session';
import { createUser, findUserByEmail } from '@/lib/auth/users';
import { createDealerFromPartner } from '@/lib/dealers/from-odoo';
import { deleteDealer, findDealerByPartnerId } from '@/lib/dealers/repo';
import { findClaimablePartner, normalizeTaxId } from '@/lib/odoo/partner-claim';
import { normalizeThaiPhone } from '@/lib/shop/shipping';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { verifyTurnstile } from '@/lib/security/turnstile';

export type ActivateResult = { ok: false; message: string; field?: string; attempt: number } | null;

const DEALER_TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

const schema = z.object({
  taxId: z.string().transform((v, ctx) => normalizeTaxId(v) ?? (ctx.addIssue({ code: 'custom', message: 'เลขผู้เสียภาษีต้องมี 13 หลัก' }), z.NEVER)),
  phone: z.string().trim().regex(/^(\+66|0)[\d\s-]{8,12}$/, 'เบอร์โทรไม่ถูกต้อง').transform(normalizeThaiPhone),
  types: z.array(z.enum(DEALER_TYPES as [DealerType, ...DealerType[]])).min(1, 'เลือกหมวดสินค้าอย่างน้อย 1 หมวด'),
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').max(254, 'อีเมลยาวเกินไป'),
  password: z.string().superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  }),
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, { message: 'ยืนยันรหัสผ่านไม่ตรงกัน', path: ['confirmPassword'] });

/** Verification attempts per IP: tax id + phone is guessable, so keep tries low. In-memory, per server instance. */
const ACTIVATE_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 } as const;
const attempts = new Map<string, number[]>();

function allowAttempt(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < ACTIVATE_RATE_LIMIT.windowMs);
  attempts.set(key, recent.length >= ACTIVATE_RATE_LIMIT.max ? recent : [...recent, now]);
  return recent.length < ACTIVATE_RATE_LIMIT.max;
}

const NOT_FOUND = 'ไม่พบร้านที่เลขผู้เสียภาษีและเบอร์โทรตรงกับข้อมูลลูกค้าของเรา ตรวจสอบอีกครั้ง หรือทัก LINE ให้ทีมงานช่วย';

/**
 * Self-activation for shops that are already customers in Odoo: verify tax id + phone against the
 * company partner, then create an ACTIVE dealer linked to it plus the DEALER_OWNER login, and sign in.
 * Credit ordering stays off until an admin turns it on.
 */
export async function activateOdooDealerAction(prev: ActivateResult, formData: FormData): Promise<ActivateResult> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const fail = (message: string, field?: string): ActivateResult => ({ ok: false, message, field, attempt });

  const h = await headers();
  const ip = h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  const bot = await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? ''), ip);
  if (!bot.ok) return fail(bot.reason, 'turnstile');

  const parsed = schema.safeParse({
    taxId: formData.get('taxId') ?? '', phone: formData.get('phone') ?? '', types: formData.getAll('types'),
    email: formData.get('email') ?? '', password: formData.get('password') ?? '', confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? 'ข้อมูลไม่ครบ', String(issue?.path[0] ?? ''));
  }
  const input = parsed.data;
  if (!allowAttempt(ip)) return fail('ลองบ่อยเกินไป กรุณาลองใหม่ภายหลัง หรือทัก LINE ได้เลย');
  if (await findUserByEmail(input.email)) return fail('อีเมลนี้มีบัญชีอยู่แล้ว เข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"', 'email');

  let partner;
  try {
    partner = await findClaimablePartner(input.taxId, input.phone);
  } catch (error) {
    console.error('[activate] odoo lookup failed', error instanceof Error ? error.message : error);
    return fail('ตรวจสอบข้อมูลกับระบบไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง');
  }
  if (!partner) {
    await audit(null, 'dealer.activate_failed', 'Dealer', input.taxId.slice(-4), { ip: ip.slice(0, 64) });
    return fail(NOT_FOUND);
  }
  const taken = 'ร้านนี้เปิดใช้บัญชีบนเว็บแล้ว เข้าสู่ระบบด้วยอีเมลเดิม หรือกด "ลืมรหัสผ่าน"';
  if (await findDealerByPartnerId(partner.id)) return fail(taken);

  const dealer = await createDealerFromPartner(partner, { types: input.types, phone: input.phone, note: `เปิดใช้บัญชีเองจากลูกค้า Odoo #${partner.id}` });
  // null: another request activated the same shop a moment ago.
  if (!dealer) return fail(taken);
  let user;
  try {
    user = await createUser({ email: input.email, name: partner.name, password: input.password, role: 'DEALER_OWNER', dealerId: dealer.id });
  } catch (error) {
    await deleteDealer(dealer.id);
    if ((error as { code?: string }).code === '23505') return fail('อีเมลนี้มีบัญชีอยู่แล้ว เข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"', 'email');
    throw error;
  }
  await audit(user.id, 'dealer.activate_from_odoo', 'Dealer', dealer.id, { odooPartnerId: partner.id, userId: user.id, ip: ip.slice(0, 64) });

  await createSession(user.id);
  await flash('เปิดใช้บัญชีร้านสำเร็จ', { icon: 'store', description: `${partner.name} · เริ่มสั่งสินค้าได้เลย` });
  redirect(homeFor('DEALER_OWNER'));
}
