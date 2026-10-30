import { Skeleton } from '@/components/ui/skeleton';

/** Order list rows. */
export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-3" aria-busy="true" aria-label="กำลังโหลดออเดอร์">
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
