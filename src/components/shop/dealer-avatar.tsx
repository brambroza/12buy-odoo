import { cn } from '@/lib/utils';
import type { DealerTier } from '@/lib/shop/types';
import { TierShield } from './tier-shield';

/** First letter of the shop name (skipping common Thai company prefixes) for the fallback avatar. */
function initial(name: string): string {
  const trimmed = name.replace(/^(บริษัท|บจก\.?|หจก\.?|ห้างหุ้นส่วนจำกัด|ร้าน)\s*/, '').trim();
  return Array.from(trimmed || name)[0]?.toUpperCase() ?? '?';
}

/** Dealer profile picture (or initial), optionally with the tier shield pinned to the corner. */
export function DealerAvatar({ name, avatarFile, tier, size = 40, className }: { name: string; avatarFile: string | null; tier?: DealerTier; size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {avatarFile ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/avatars/${avatarFile}`} alt={`รูปโปรไฟล์ ${name}`} width={size} height={size} className="size-full rounded-full border border-border bg-muted object-cover" />
      ) : (
        <span aria-hidden="true" className="flex size-full items-center justify-center rounded-full bg-primary/10 font-bold text-primary" style={{ fontSize: size * 0.42 }}>{initial(name)}</span>
      )}
      {tier && <TierShield tier={tier} size={Math.max(14, Math.round(size * 0.42))} className="absolute -bottom-1 -right-1" />}
    </span>
  );
}
