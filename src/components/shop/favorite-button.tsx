'use client';

import { useOptimistic, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { toggleFavoriteAction } from '@/app/shop/actions';
import { cn } from '@/lib/utils';

/** Heart toggle for "รายการโปรด"; flips at once and syncs through the server action. */
export function FavoriteButton({ productId, active, className }: { productId: number; active: boolean; className?: string }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(active);
  const label = optimistic ? 'เอาออกจากรายการโปรด' : 'เพิ่มในรายการโปรด';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() => startTransition(async () => { setOptimistic(!optimistic); await toggleFavoriteAction(productId); })}
      className={cn('flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground transition hover:text-primary', optimistic && 'border-primary/30 text-primary', className)}
    >
      <Heart className={cn('size-4', optimistic && 'fill-current')} />
    </button>
  );
}
