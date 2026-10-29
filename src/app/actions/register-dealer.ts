'use server';

import { headers } from 'next/headers';
import { dealerLeadSchema, leadFromFormData } from '@/lib/leads/schema';
import { createLead } from '@/lib/leads/repo';
import { allowSubmission, notifyLead } from '@/lib/leads/store';

export type RegisterResult = { ok: true; message: string } | { ok: false; message: string; field?: string } | null;

/** Handles the public dealer sign-up form: validate, rate-limit, store in Postgres, notify sales. */
export async function registerDealerAction(_prev: RegisterResult, formData: FormData): Promise<RegisterResult> {
  const parsed = dealerLeadSchema.safeParse(leadFromFormData(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? 'ข้อมูลไม่ครบ', field: issue?.path?.[0]?.toString() };
  }
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  if (!allowSubmission(ip)) return { ok: false, message: 'ส่งข้อมูลบ่อยเกินไป กรุณาลองใหม่ภายหลัง หรือทัก LINE ได้เลย' };
  try {
    const lead = await createLead(parsed.data);
    await notifyLead({ ...parsed.data, id: lead.id, createdAt: lead.createdAt, source: lead.source });
  } catch (error) {
    console.error('[lead] save failed', error instanceof Error ? error.message : error);
    return { ok: false, message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่ หรือทัก LINE ได้เลย' };
  }
  return { ok: true, message: 'รับข้อมูลแล้ว ทีมงานจะติดต่อกลับภายใน 1 วันทำการ' };
}
