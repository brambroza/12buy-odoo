import { cn } from '@/lib/utils';
import { DEALER_TIER_LABELS, type DealerTier } from '@/lib/shop/types';

/** Shield colours per tier set by the admin: S bronze, M silver, L gold. */
const TIER_STYLE: Record<DealerTier, { from: string; to: string; edge: string; star: string; pill: string }> = {
  S: { from: '#f0b27a', to: '#a0522d', edge: '#7c3f1d', star: '#fff7ed', pill: 'bg-orange-100 text-orange-900 ring-orange-300' },
  M: { from: '#f1f5f9', to: '#94a3b8', edge: '#64748b', star: '#ffffff', pill: 'bg-slate-100 text-slate-800 ring-slate-300' },
  L: { from: '#fde68a', to: '#ca8a04', edge: '#a16207', star: '#fffbeb', pill: 'bg-amber-100 text-amber-900 ring-amber-300' },
};

/** Stars on the shield: one per tier step, so the level reads without colour too. */
const STARS: Record<DealerTier, number> = { S: 1, M: 2, L: 3 };

/** Dealer tier shield icon; `withLabel` adds the tier name in a pill beside it. */
export function TierShield({ tier, size = 20, withLabel = false, className }: { tier: DealerTier; size?: number; withLabel?: boolean; className?: string }) {
  const style = TIER_STYLE[tier] ?? TIER_STYLE.M;
  const label = DEALER_TIER_LABELS[tier] ?? tier;
  const gradientId = `tier-shield-${tier}`;
  const stars = STARS[tier] ?? 1;
  const starXs = stars === 1 ? [12] : stars === 2 ? [9, 15] : [7, 12, 17];
  const icon = (
    <svg width={size} height={size * 1.15} viewBox="0 0 24 27.6" role={withLabel ? undefined : 'img'} aria-hidden={withLabel || undefined} aria-label={withLabel ? undefined : `ระดับ${label}`} className="shrink-0 drop-shadow-sm">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={style.from} />
          <stop offset="1" stopColor={style.to} />
        </linearGradient>
      </defs>
      <path d="M12 1 L22 4.6 V12.8 C22 19.4 17.6 24.2 12 26.6 C6.4 24.2 2 19.4 2 12.8 V4.6 Z" fill={`url(#${gradientId})`} stroke={style.edge} strokeWidth="1.4" strokeLinejoin="round" />
      {starXs.map((x) => (
        <path key={x} transform={`translate(${x} 13.2) scale(${stars === 3 ? 0.42 : 0.5})`} d="M0 -6 L1.76 -2.43 L5.71 -1.85 L2.85 0.93 L3.53 4.85 L0 3 L-3.53 4.85 L-2.85 0.93 L-5.71 -1.85 L-1.76 -2.43 Z" fill={style.star} />
      ))}
    </svg>
  );
  if (!withLabel) return <span className={cn('inline-flex', className)} title={label}>{icon}</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-xs font-semibold ring-1', style.pill, className)}>
      {icon}
      {label}
    </span>
  );
}
