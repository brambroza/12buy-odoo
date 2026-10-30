import { Skeleton } from '@/components/ui/skeleton';

/** Generic back-office skeleton: title, filter bar, table rows. */
export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลด">
      <div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-9 w-28 rounded-lg" /></div>
      <div className="flex gap-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}</div>
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3"><Skeleton className="h-4 w-full" /></div>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="border-b border-border p-3 last:border-0"><Skeleton className="h-5 w-full" /></div>)}
      </div>
    </div>
  );
}
