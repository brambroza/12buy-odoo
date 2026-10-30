import { Skeleton } from '@/components/ui/skeleton';

/** Order header, timeline and lines. */
export default function OrderLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-label="กำลังโหลดออเดอร์">
      <div className="flex items-center justify-between"><Skeleton className="h-7 w-40" /><Skeleton className="h-6 w-24 rounded-full" /></div>
      <div className="flex justify-between rounded-xl border border-border bg-card p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="size-8 rounded-full" />)}</div>
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        <Skeleton className="ml-auto h-6 w-32" />
      </div>
    </div>
  );
}
