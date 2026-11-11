'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit } from '@/lib/auth/audit';
import { requireAdmin } from '@/lib/auth/session';
import { flash } from '@/lib/flash';
import { parseSectionForm, sectionDef, type SectionDef } from '@/lib/landing/cms';
import { resetLandingSection, saveLandingSection } from '@/lib/landing/repo';
import { saveLandingImage } from '@/lib/shop/uploads';

const PATH = '/admin/landing';

function back(tab: string, error?: string): never {
  redirect(`${PATH}?tab=${encodeURIComponent(tab)}${error ? `&error=${encodeURIComponent(error)}` : ''}`);
}

/** Every image input name a section form can carry (`upload:` + field input name). */
function imageInputs(def: SectionDef, rows: number): string[] {
  const names = def.fields.filter((f) => f.kind === 'image').map((f) => `f:${f.name}`);
  const listImages = def.list?.fields.filter((f) => f.kind === 'image') ?? [];
  for (let r = 0; r < rows; r++) for (const f of listImages) names.push(`i:${r}:${f.name}`);
  return names;
}

/** Saves one landing section. New image files are uploaded first and replace the picked image. */
export async function saveLandingSectionAction(formData: FormData) {
  const actor = await requireAdmin();
  const def = sectionDef(String(formData.get('section') ?? ''));
  if (!def) back('hero', 'ไม่พบส่วนที่ต้องการแก้ไข');
  const rows = Math.min(Number(formData.get('rows')) || 0, (def.list?.max ?? 0) + 5);

  const uploads: Record<string, string> = {};
  for (const name of imageInputs(def, rows)) {
    const file = formData.get(`upload:${name}`);
    if (!(file instanceof File) || file.size === 0) continue;
    const saved = await saveLandingImage(file);
    if (!saved.ok) back(def.key, saved.reason);
    uploads[name] = `/api/landing-images/${saved.name}`;
  }

  const parsed = parseSectionForm(def, formData, uploads);
  if (!parsed.ok) back(def.key, parsed.error);
  await saveLandingSection(def.key, parsed.value, actor.id);
  await audit(actor.id, 'landing.update', 'AppSetting', `landing.${def.key}`, { section: def.key, uploads: Object.values(uploads) });
  revalidatePath('/');
  await flash(`บันทึก “${def.label}” แล้ว`, { icon: 'save', description: 'หน้าแรกอัปเดตแล้ว' });
  back(def.key);
}

/** Puts one section back to the copy that shipped with the site. */
export async function resetLandingSectionAction(formData: FormData) {
  const actor = await requireAdmin();
  const def = sectionDef(String(formData.get('section') ?? ''));
  if (!def) back('hero', 'ไม่พบส่วนที่ต้องการแก้ไข');
  await resetLandingSection(def.key, actor.id);
  await audit(actor.id, 'landing.reset', 'AppSetting', `landing.${def.key}`, { section: def.key });
  revalidatePath('/');
  await flash(`คืนค่าเริ่มต้น “${def.label}” แล้ว`, { icon: 'save' });
  back(def.key);
}
