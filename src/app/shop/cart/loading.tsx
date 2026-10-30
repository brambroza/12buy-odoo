import { Skeleton } from '@/components/ui/skeleton';

/** Cart lines on the left, checkout summary on the right. */
export default function CartLoading() {
  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:space-y-0" aria-busy="true" aria-label="กำลังโหลดตะกร้า">
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="size-16 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
