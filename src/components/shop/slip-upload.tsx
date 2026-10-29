'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, ImageUp, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;
/** Phone photos are 3–8 MB; shrink anything larger than this so the upload stays fast. */
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 2000;

/**
 * Re-encodes a large photo as JPEG with its long edge capped at 2000 px.
 * A slip stays readable at that size and drops to a few hundred KB.
 * Returns the original file when it is already small or the browser cannot decode it.
 */
async function shrinkImage(file: File): Promise<File> {
  if (file.size <= COMPRESS_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Human file size, e.g. `320 KB`, `1.4 MB`. */
function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Slip picker: drag & drop or browse on desktop, camera or photo library on phones.
 * Shows a preview before sending; posts `orderId` + `slip` to the given server action.
 */
export function SlipUpload({ orderId, action, replacing }: { orderId: string; action: (formData: FormData) => Promise<void>; replacing: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [pending, startTransition] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const accept = async (picked: File | undefined | null) => {
    setError(null);
    if (!picked) return;
    if (!ACCEPT.split(',').includes(picked.type)) { setError('รองรับเฉพาะรูป JPG, PNG, WebP'); return; }
    setPreparing(true);
    const ready = await shrinkImage(picked);
    setPreparing(false);
    if (ready.size > MAX_BYTES) { setError('ไฟล์ใหญ่เกิน 5 MB'); return; }
    setFile(ready);
    setPreview(URL.createObjectURL(ready));
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (pickerRef.current) pickerRef.current.value = '';
  };

  const submit = () => {
    if (!file) return;
    const formData = new FormData();
    formData.set('orderId', orderId);
    formData.set('slip', file);
    startTransition(() => action(formData));
  };

  const busy = preparing || pending;

  return (
    <div className="space-y-3">
      <input ref={cameraRef} type="file" accept={ACCEPT} capture="environment" className="hidden" onChange={(e) => accept(e.target.files?.[0])} />
      <input ref={pickerRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => accept(e.target.files?.[0])} />

      {preview && file ? (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
          <div className="relative flex justify-center bg-muted p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="ตัวอย่างสลิป" className="max-h-80 rounded-lg object-contain" />
            {!pending && (
              <button type="button" onClick={clear} aria-label="เอารูปนี้ออก" className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/90 shadow hover:bg-background">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 p-3">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{file.name} · {formatSize(file.size)}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => pickerRef.current?.click()} disabled={pending}><RefreshCw className="size-4" /> เปลี่ยนรูป</Button>
            <Button type="button" size="sm" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {pending ? 'กำลังส่ง...' : replacing ? 'ส่งสลิปใหม่' : 'ส่งสลิป'}
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="ลากสลิปมาวาง หรือกดเพื่อเลือกรูป"
          onClick={() => pickerRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickerRef.current?.click(); } }}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary',
            dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/60 hover:bg-muted/50',
          )}
        >
          <span className={cn('flex size-12 items-center justify-center rounded-full transition-colors', dragging ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
            {busy ? <Loader2 className="size-6 animate-spin" /> : <ImageUp className="size-6" />}
          </span>
          <p className="text-sm font-medium">
            {preparing ? 'กำลังเตรียมรูป...' : dragging ? 'ปล่อยเพื่อแนบสลิป' : <><span className="hidden md:inline">ลากรูปสลิปมาวางที่นี่ หรือ </span><span className="text-primary underline-offset-2 md:underline">เลือกรูปสลิป</span></>}
          </p>
          <p className="text-xs text-muted-foreground">JPG, PNG, WebP · รูปใหญ่ระบบย่อให้อัตโนมัติ</p>
        </div>
      )}

      {!file && (
        <div className="grid grid-cols-2 gap-2 md:hidden">
          <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={busy}><Camera className="size-4" /> ถ่ายรูปสลิป</Button>
          <Button type="button" variant="outline" onClick={() => pickerRef.current?.click()} disabled={busy}><ImageUp className="size-4" /> เลือกจากรูป</Button>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
