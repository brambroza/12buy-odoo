'use client';

import { useEffect } from 'react';
import { recordViewedAction } from '@/app/shop/actions';

/** Records the product in the "ดูล่าสุด" cookie once the page is shown (server components cannot set cookies). */
export function RecentlyViewedTracker({ productId }: { productId: number }) {
  useEffect(() => { void recordViewedAction(productId); }, [productId]);
  return null;
}
