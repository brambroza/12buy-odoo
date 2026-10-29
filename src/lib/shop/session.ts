import { requireDealerAccess } from '@/lib/auth/session';
import { dealerScopeKey } from './dealer';

/**
 * Key that scopes carts and orders: `dealer:<id>` for dealer users (so the cart
 * follows them across devices) or `staff:<userId>:<partner>` for back-office
 * users browsing the shop. Visitors without a session get a key that owns nothing.
 */
export async function getSessionId(): Promise<string> {
  return (await dealerScopeKey()) ?? 'guest';
}

/**
 * Same as `getSessionId`, but for server actions and route handlers that write:
 * requires an active dealer (or back-office) session and redirects to login
 * otherwise, so anonymous requests can never create carts or orders.
 */
export async function ensureSessionId(): Promise<string> {
  await requireDealerAccess();
  const scoped = await dealerScopeKey();
  if (!scoped) throw new Error('No dealer scope for signed-in user');
  return scoped;
}
