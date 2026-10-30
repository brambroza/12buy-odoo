import { Skeleton } from '@/components/ui/skeleton';

/** Image, title and price box placeholders for the product page. */
export default function ProductLoading() {
  return (
    <div className="space-y-4 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-8 md:space-y-0" aria-busy="true" aria-label="กำลังโหลดสินค้า">
      <div className="space-y-3">
        <Skeleton className="aspect-square w-full rounded-2xl md:aspect-[4/3]" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
