'use server';

import { flash } from '@/lib/flash';
import { headers } from 'next/headers';
import { dealerLeadSchema, leadFromFormData } from '@/lib/leads/schema';
import { createLead, findOpenLeadByEmail, findOpenLeadByTaxId } from '@/lib/leads/repo';
import { allowSubmission, notifyLead, toNotification } from '@/lib/leads/store';
import { findDealerByTaxId } from '@/lib/dealers/repo';
import { findUserByEmail } from '@/lib/auth/users';
import { findPartnersByTaxId } from '@/lib/odoo/partner-claim';
import { verifyTurnstile } from '@/lib/security/turnstile';

/** What the user typed (never the password), sent back so the form can be refilled after an error. */
export type RegisterValues = { shopName: string; taxId: string; phone: string; lineId: string; email: string; types: string[]; address: { line: string; province: string; district: string; subdistrict: string; postalCode: string } };
/** `hint: 'activate'` = the shop is already an Odoo customer; the form offers the /activate link. */
export type RegisterResult = { ok: true; message: string } | { ok: false; message: string; field?: string; hint?: 'activate'; values?: RegisterValues; attempt?: number } | null;

function typedValues(formData: FormData): RegisterValues {
  const get = (k: string) => String(formData.get(k) ?? '').slice(0, 300);
  return {
    shopName: get('shopName'), taxId: get('taxId'), phone: get('phone'), lineId: get('lineId'), email: get('email'), types: formData.getAll('types').map(String),
    address: { line: get('line'), province: get('province'), district: get('district'), subdistrict: get('subdistrict'), postalCode: get('postalCode') },
  };
}

/**
 * Handles the public dealer sign-up form: bot check (Cloudflare Turnstile), validate,
 * rate-limit, refuse a tax id or email that already belongs to a dealer, an open application or an
 * Odoo customer (those activate instead), store the lead (password as a hash) and notify sales.
 */
export async function registerDealerAction(prev: RegisterResult, formData: FormData): Promise<RegisterResult> {
  const result = await register(formData);
  if (result?.ok === false) return { ...result, values: typedValues(formData), attempt: (prev?.ok === false ? prev.attempt ?? 0 : 0) + 1 };
  return result;
}

/**
 * Why this tax id cannot apply again, or null when it is new to us. Checked in order: a web dealer
 * (sign in instead), an open application (sales is on it), an Odoo customer without a web account
 * (self-activate at /activate). The Odoo check is best-effort: when Odoo is down the lead is still taken
 * and the admin sees the match at approval (`ensureDealerPartner` reuses the partner by tax id).
 */
async function duplicateTaxId(taxId: string): Promise<{ message: string; hint?: 'activate' } | null> {
  if (await findDealerByTaxId(taxId)) return { message: 'เลขผู้เสียภาษีนี้เป็นดีลเลอร์ของเราแล้ว เข้าสู่ระบบด้วยอีเมลเดิม หรือกด "ลืมรหัสผ่าน" หากจำไม่ได้ทัก LINE ให้ทีมงานช่วย' };
  if (await findOpenLeadByTaxId(taxId)) return { message: 'เลขผู้เสียภาษีนี้ส่งใบสมัครไว้แล้ว ทีมงานกำลังตรวจสอบและจะติดต่อกลับ' };
  try {
    if ((await findPartnersByTaxId(taxId)).length > 0) return { message: 'ร้านนี้เป็นลูกค้าของเราอยู่แล้ว ไม่ต้องสมัครใหม่ เปิดใช้บัญชีด้วยเลขผู้เสียภาษีและเบอร์โทรที่ให้ไว้กับเราได้เลย', hint: 'activate' };
  } catch (error) {
    console.error('[lead] odoo tax id lookup failed', error instanceof Error ? error.message : error);
  }
  return null;
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
  const duplicate = await duplicateTaxId(parsed.data.taxId);
  if (duplicate) return { ok: false, message: duplicate.message, hint: duplicate.hint, field: 'taxId' };
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
