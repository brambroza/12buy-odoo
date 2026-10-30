import { Skeleton } from '@/components/ui/skeleton';

/** Search box, filter chips and product rows while the catalog loads. */
export default function SearchLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดผลการค้นหา">
      <Skeleton className="h-12 w-full rounded-xl md:max-w-2xl" />
      <div className="flex gap-1.5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="size-20 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
