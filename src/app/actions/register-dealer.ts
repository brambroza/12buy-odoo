'use server';

import { flash } from '@/lib/flash';
import { headers } from 'next/headers';
import { dealerLeadSchema, leadFromFormData } from '@/lib/leads/schema';
import { createLead, findOpenLeadByEmail } from '@/lib/leads/repo';
import { allowSubmission, notifyLead, toNotification } from '@/lib/leads/store';
import { findUserByEmail } from '@/lib/auth/users';
import { verifyTurnstile } from '@/lib/security/turnstile';

/** What the user typed (never the password), sent back so the form can be refilled after an error. */
export type RegisterValues = { shopName: string; phone: string; lineId: string; email: string; types: string[]; address: { line: string; province: string; district: string; subdistrict: string; postalCode: string } };
export type RegisterResult = { ok: true; message: string } | { ok: false; message: string; field?: string; values?: RegisterValues; attempt?: number } | null;

function typedValues(formData: FormData): RegisterValues {
  const get = (k: string) => String(formData.get(k) ?? '').slice(0, 300);
  return {
    shopName: get('shopName'), phone: get('phone'), lineId: get('lineId'), email: get('email'), types: formData.getAll('types').map(String),
    address: { line: get('line'), province: get('province'), district: get('district'), subdistrict: get('subdistrict'), postalCode: get('postalCode') },
  };
}

/**
 * Handles the public dealer sign-up form: bot check (Cloudflare Turnstile), validate,
 * rate-limit, refuse an email that already has an account or an open application,
 * store the lead (password as a hash) and notify sales.
 */
export async function registerDealerAction(prev: RegisterResult, formData: FormData): Promise<RegisterResult> {
  const result = await register(formData);
  if (result?.ok === false) return { ...result, values: typedValues(formData), attempt: (prev?.ok === false ? prev.attempt ?? 0 : 0) + 1 };
  return result;
}

async function register(formData: FormData): Promise<RegisterResult> {
  const h = await headers();
  const ip = h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  const bot = await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? ''), ip);
  if (!bot.ok) return { ok: false, message: bot.reason, field: 'turnstile' };

  const parsed = dealerLeadSchema.safeParse(leadFromFormData(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path ?? [];
    return { ok: false, message: issue?.message ?? 'ข้อมูลไม่ครบ', field: String(path[0] === 'address' ? path[1] ?? 'line' : path[0] ?? '') };
  }
  if (!allowSubmission(ip)) return { ok: false, message: 'ส่งข้อมูลบ่อยเกินไป กรุณาลองใหม่ภายหลัง หรือทัก LINE ได้เลย' };
  if (await findUserByEmail(parsed.data.email)) return { ok: false, message: 'อีเมลนี้มีบัญชีอยู่แล้ว เข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"', field: 'email' };
  if (await findOpenLeadByEmail(parsed.data.email)) return { ok: false, message: 'อีเมลนี้ส่งใบสมัครไว้แล้ว ทีมงานกำลังตรวจสอบ', field: 'email' };
  try {
    const lead = await createLead(parsed.data);
    await notifyLead(toNotification(parsed.data, { id: lead.id, createdAt: lead.createdAt, source: lead.source }));
  } catch (error) {
    console.error('[lead] save failed', error instanceof Error ? error.message : error);
    return { ok: false, message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่ หรือทัก LINE ได้เลย' };
  }
  await flash('ส่งใบสมัครสำเร็จ', { icon: 'send', description: 'ทีมงานจะตรวจสอบและติดต่อกลับภายใน 1 วันทำการ' });
  return { ok: true, message: 'รับใบสมัครแล้ว ทีมงานจะตรวจสอบและติดต่อกลับภายใน 1 วันทำการ เมื่ออนุมัติแล้วเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้ได้ทันที' };
}
