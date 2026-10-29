import { Skeleton } from '@/components/ui/skeleton';

/** Shown while shop pages fetch the catalog/stock from Odoo, so the screen never sits blank. */
export default function ShopLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-3" aria-busy="true" aria-label="กำลังโหลด">
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
