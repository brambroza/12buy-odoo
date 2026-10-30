'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import * as admin from '@/lib/admin/store';
import { audit } from '@/lib/auth/audit';
import { requireAdmin } from '@/lib/auth/session';
import { flash } from '@/lib/flash';

const PATH = '/admin/promotions';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  id: z.string().max(40).optional(),
  title: z.string().trim().min(2, 'กรอกหัวข้อ').max(120),
  body: z.string().trim().min(2, 'กรอกรายละเอียดสั้น ๆ').max(300),
  image: z.string().trim().min(1, 'เลือกรูป').max(500).refine((v) => v.startsWith('/') || /^https:\/\//.test(v), 'รูปต้องเป็น path ในเว็บ (/landing/…) หรือ https URL'),
  from: z.string().regex(DATE, 'วันเริ่มไม่ถูกต้อง'),
  to: z.string().regex(DATE, 'วันสิ้นสุดไม่ถูกต้อง'),
  href: z.string().trim().min(1).max(300).refine((v) => v.startsWith('/') && !v.startsWith('//'), 'ลิงก์ต้องเป็นหน้าในเว็บ เช่น /tires?type=CAR'),
  active: z.boolean(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
}).refine((v) => v.from <= v.to, { message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', path: ['to'] });

function revalidate() {
  revalidatePath('/');
  revalidatePath(PATH);
}

/** Creates or updates a landing promotion card. */
export async function savePromotionAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get('id') || undefined, title: formData.get('title'), body: formData.get('body'), image: formData.get('image'),
    from: formData.get('from'), to: formData.get('to'), href: formData.get('href'), active: formData.get('active') === 'on', sort: formData.get('sort') || undefined,
  });
  if (!parsed.success) {
    const id = String(formData.get('id') ?? '');
    redirect(`${PATH}?${id ? `edit=${encodeURIComponent(id)}&` : 'new=1&'}error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')}`);
  }
  const promo = await admin.upsertPromotion(parsed.data);
  await audit(actor.id, parsed.data.id ? 'promotion.update' : 'promotion.create', 'AdminPromotion', promo.id, { title: promo.title, from: promo.from, to: promo.to, active: promo.active });
  revalidate();
  await flash(parsed.data.id ? 'บันทึกโปรโมชันแล้ว' : 'เพิ่มโปรโมชันแล้ว', { icon: 'save', description: `${promo.title} · หน้าแรกอัปเดตภายใน 5 นาที` });
  redirect(PATH);
}

export async function deletePromotionAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await admin.deletePromotion(id);
  await audit(actor.id, 'promotion.delete', 'AdminPromotion', id);
  revalidate();
  await flash('ลบโปรโมชันแล้ว', { icon: 'delete' });
  redirect(PATH);
}
