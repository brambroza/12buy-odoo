'use client';

import { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Image input for `/admin/landing`: shows the current picture, lets the admin pick one from the image
 * library (shipped artwork + earlier uploads) or upload a new file, which wins over the pick.
 * Posts the picked path as `name` and the file as `upload:<name>`.
 */
export function LandingImageField({ name, label, value, library }: { name: string; label: string; value: string; library: string[] }) {
  const [picked, setPicked] = useState(value);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);
  const options = value && !library.includes(value) ? [value, ...library] : library;
  const shown = filePreview ?? picked;

  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-medium">{label}</legend>
      <div className="flex items-start gap-3">
        <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {/* Plain <img>: previews include blob: URLs that next/image cannot load. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shown ? <img src={shown} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-[11px] text-muted-foreground">ยังไม่เลือกรูป</span>}
        </div>
        <div className="min-w-0 space-y-1.5 text-xs">
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={filePreview ? 'ไฟล์ใหม่ (อัปโหลดเมื่อกดบันทึก)' : picked}>{filePreview ? 'ไฟล์ใหม่ · อัปโหลดเมื่อกดบันทึก' : picked || '—'}</p>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 font-medium hover:bg-muted">
            <ImagePlus className="size-3.5" /> อัปโหลดรูปใหม่
            <input
              type="file"
              name={`upload:${name}`}
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setFilePreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">JPG, PNG, WebP ไม่เกิน 4 MB</p>
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">เลือกจากคลังรูป ({options.length})</summary>
        <div className="mt-2 grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
          {options.map((src) => (
            <label key={src} className={cn('relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-md border-2', picked === src && !filePreview ? 'border-primary' : 'border-transparent')}>
              <input type="radio" name={name} value={src} checked={picked === src} onChange={() => setPicked(src)} className="sr-only" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            </label>
          ))}
        </div>
      </details>
      {/* Keeps the field posted when the library is empty or nothing matches. */}
      {!options.includes(picked) && <input type="hidden" name={name} value={picked} />}
    </fieldset>
  );
}
