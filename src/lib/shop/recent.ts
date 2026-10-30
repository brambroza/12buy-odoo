import { cookies } from 'next/headers';

export const RECENT_COOKIE = 'shop_recent';
export const RECENT_MAX = 12;

/** Parses the cookie value into product ids, newest first. */
export function parseRecent(raw: string | undefined): number[] {
  return (raw ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, RECENT_MAX);
}

/** New cookie value with `productId` moved to the front. */
export function pushRecent(current: number[], productId: number): number[] {
  return [productId, ...current.filter((id) => id !== productId)].slice(0, RECENT_MAX);
}

/** Recently viewed product ids of this browser. */
export async function getRecentlyViewed(): Promise<number[]> {
  return parseRecent((await cookies()).get(RECENT_COOKIE)?.value);
}
