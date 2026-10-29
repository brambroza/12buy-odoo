/** Dealer-uploaded transfer slips in the private Supabase Storage bucket `slips` (served only via the app's route). */
import { db } from '@/lib/db/client';

const BUCKET = 'slips';
const ALLOWED: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const NAME_PATTERN = /^[a-z0-9]+-[a-z0-9]+\.(jpg|png|webp)$/i;

/** Detects the real image type from the first bytes, so a renamed file cannot pass as an image. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** Validates and stores an uploaded image. Returns the stored file name or a Thai error message. */
export async function saveSlip(orderId: string, file: File): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  if (file.size === 0) return { ok: false, reason: 'ไฟล์ว่าง' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'ไฟล์ใหญ่เกิน 5 MB' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  const ext = type ? ALLOWED[type] : undefined;
  if (!type || !ext) return { ok: false, reason: 'รองรับเฉพาะรูป JPG, PNG, WebP' };
  const name = `${orderId.replace(/[^a-z0-9]/gi, '')}-${Date.now().toString(36)}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(name, bytes, { contentType: type, upsert: false });
  if (error) {
    console.error('[slips] upload failed', error.message);
    return { ok: false, reason: 'อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่' };
  }
  return { ok: true, name };
}

/** Reads a stored slip by its file name (validated against a strict pattern). */
export async function readSlip(name: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!NAME_PATTERN.test(name)) return null;
  const { data, error } = await db().storage.from(BUCKET).download(name);
  if (error || !data) return null;
  const ext = name.split('.').pop()!.toLowerCase();
  return { body: Buffer.from(await data.arrayBuffer()), contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` };
}

/** Removes a slip that was replaced by a newer upload. Failures are only logged. */
export async function deleteSlip(name: string): Promise<void> {
  if (!NAME_PATTERN.test(name)) return;
  const { error } = await db().storage.from(BUCKET).remove([name]);
  if (error) console.error('[slips] delete failed', error.message);
}
