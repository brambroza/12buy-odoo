/**
 * Dealer-uploaded images in private Supabase Storage buckets (served only via the app's routes):
 * transfer slips (`slips`) and dealer profile pictures (`avatars`).
 */
import { db } from '@/lib/db/client';

const BUCKET = 'slips';
const AVATAR_BUCKET = 'avatars';
const ALLOWED: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Vercel caps a request body at 4.5 MB, so stay under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** The browser shrinks the picture before upload; this only stops oversized raw files. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const NAME_PATTERN = /^[a-z0-9]+-[a-z0-9]+\.(jpg|png|webp)$/i;
/** Same shape as slip names: `<dealerId>-<time>.<ext>`. Shared with profile sanitising. */
export const AVATAR_NAME = NAME_PATTERN;

type SaveResult = { ok: true; name: string } | { ok: false; reason: string };

/** Detects the real image type from the first bytes, so a renamed file cannot pass as an image. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** Validates an image upload and stores it as `<ownerId>-<time>.<ext>` in `bucket`. */
async function saveImage(bucket: string, ownerId: string, file: File, maxBytes: number, failMessage: string): Promise<SaveResult> {
  if (file.size === 0) return { ok: false, reason: 'ไฟล์ว่าง' };
  if (file.size > maxBytes) return { ok: false, reason: `ไฟล์ใหญ่เกิน ${maxBytes / 1024 / 1024} MB` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  const ext = type ? ALLOWED[type] : undefined;
  if (!type || !ext) return { ok: false, reason: 'รองรับเฉพาะรูป JPG, PNG, WebP' };
  const name = `${ownerId.replace(/[^a-z0-9]/gi, '')}-${Date.now().toString(36)}.${ext}`;
  const { error } = await db().storage.from(bucket).upload(name, bytes, { contentType: type, upsert: false });
  if (error) {
    console.error(`[${bucket}] upload failed`, error.message);
    return { ok: false, reason: failMessage };
  }
  return { ok: true, name };
}

async function readImage(bucket: string, name: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!NAME_PATTERN.test(name)) return null;
  const { data, error } = await db().storage.from(bucket).download(name);
  if (error || !data) return null;
  const ext = name.split('.').pop()!.toLowerCase();
  return { body: Buffer.from(await data.arrayBuffer()), contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` };
}

async function deleteImage(bucket: string, name: string): Promise<void> {
  if (!NAME_PATTERN.test(name)) return;
  const { error } = await db().storage.from(bucket).remove([name]);
  if (error) console.error(`[${bucket}] delete failed`, error.message);
}

/** Validates and stores an uploaded slip. Returns the stored file name or a Thai error message. */
export function saveSlip(orderId: string, file: File): Promise<SaveResult> {
  return saveImage(BUCKET, orderId, file, MAX_UPLOAD_BYTES, 'อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่');
}

/** Reads a stored slip by its file name (validated against a strict pattern). */
export function readSlip(name: string) {
  return readImage(BUCKET, name);
}

/** Removes a slip that was replaced by a newer upload. Failures are only logged. */
export function deleteSlip(name: string): Promise<void> {
  return deleteImage(BUCKET, name);
}

/** Validates and stores a dealer profile picture. */
export function saveAvatar(dealerId: string, file: File): Promise<SaveResult> {
  return saveImage(AVATAR_BUCKET, dealerId, file, MAX_AVATAR_BYTES, 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
}

/** Reads a stored profile picture by its file name. */
export function readAvatar(name: string) {
  return readImage(AVATAR_BUCKET, name);
}

/** Removes a replaced profile picture. Failures are only logged. */
export function deleteAvatar(name: string): Promise<void> {
  return deleteImage(AVATAR_BUCKET, name);
}
