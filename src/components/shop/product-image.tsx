import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Product picture through `next/image` (resized, lazy, cached) with the "no picture" tile as fallback.
 * Odoo hosts the originals; `next.config.ts` allows `*.odoo.com` plus the configured ODOO_URL host.
 */
export function ProductImage({ src, alt, className, sizes = '80px', priority = false }: { src: string | null; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  if (!src) return <div className={cn('flex items-center justify-center bg-muted text-xs text-muted-foreground', className)}>ไม่มีรูป</div>;
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" unoptimized={!/^https?:\/\//.test(src)} />
    </div>
  );
}
