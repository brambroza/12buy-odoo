import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Two download links (CSV, Excel) for an export endpoint; `query` carries the page's current filters. */
export function ExportMenu({ kind, query = {}, label = 'ส่งออก', size = 'sm' }: { kind: 'orders' | 'order-lines' | 'dealers' | 'prices'; query?: Record<string, string | undefined>; label?: string; size?: 'sm' | 'xs' }) {
  const href = (format: 'csv' | 'xlsx') => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v);
    sp.set('format', format);
    return `/api/admin/export/${kind}?${sp.toString()}`;
  };
  return (
    <span className="inline-flex items-center gap-1">
      <Button nativeButton={false} render={<a href={href('csv')} />} size={size === 'xs' ? 'sm' : 'sm'} variant="outline" className={size === 'xs' ? 'h-8 px-2 text-xs' : undefined}><Download /> {label} CSV</Button>
      <Button nativeButton={false} render={<a href={href('xlsx')} />} size="sm" variant="outline" className={size === 'xs' ? 'h-8 px-2 text-xs' : undefined}>Excel</Button>
    </span>
  );
}
