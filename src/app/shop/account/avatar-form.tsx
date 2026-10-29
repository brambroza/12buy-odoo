'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateAvatarAction, type AvatarResult } from '@/app/shop/actions';

/** Output size of the square profile picture. */
const AVATAR_PX = 512;

/** Centre-crops the picked image to a square and re-encodes it as JPEG, so phone photos upload small. */
async function squareJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(AVATAR_PX, side);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('encode failed');
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

/** Pick, crop and upload the shop's profile picture; the server keeps only the newest one. */
export function AvatarForm({ hasAvatar }: { hasAvatar: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<AvatarResult, FormData>(updateAvatarAction, null);
  const busy = pending || preparing;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLocalError(null);
    setPreparing(true);
    try {
      const formData = new FormData();
      formData.set('avatar', await squareJpeg(file));
      startTransition(() => action(formData));
    } catch {
      setLocalError('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG');
    } finally {
      setPreparing(false);
    }
  }

  function remove() {
    const formData = new FormData();
    formData.set('remove', '1');
    startTransition(() => action(formData));
  }

  const message = localError ?? state?.message;
  const failed = !!localError || state?.ok === false;
  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={onPick} tabIndex={-1} aria-hidden="true" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {hasAvatar ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
        </Button>
        {hasAvatar && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove} className="text-muted-foreground">
            <Trash2 className="size-4" /> ลบรูป
          </Button>
        )}
      </div>
      {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'text-xs text-destructive' : 'text-xs text-emerald-700'}>{message}</p>}
    </div>
  );
}
