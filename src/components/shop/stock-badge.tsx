import { cn } from '@/lib/utils';

/** Plain-language stock indicator: in stock / low / out of stock (orders over stock are blocked at checkout). */
export function StockBadge({ qty }: { qty: number }) {
  const state = qty >= 8 ? { label: 'มีของ', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
    : qty > 0 ? { label: `เหลือน้อย (${qty})`, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
    : { label: 'หมด · สอบถามฝ่ายขาย', cls: 'bg-destructive/10 text-destructive' };
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', state.cls)}>{state.label}</span>;
}
