import data from '@/data/thai-address.json';
import { guessThaiAddress, type ThaiAddress, type ThaiAddressData } from '@/lib/thai-address';
import type { DealerProfile } from './types';

/**
 * Address to prefill at checkout: the dealer's saved structured address, otherwise one read from the
 * free-text address it already has (Odoo partner or `Dealer.address`), so dealers activated from Odoo
 * do not type it again. `guessed` tells the form to save the structured copy with the order.
 */
export function checkoutAddress(profile: Pick<DealerProfile, 'shipping' | 'address' | 'province'>): { address: ThaiAddress | null; guessed: boolean } {
  if (profile.shipping) return { address: profile.shipping, guessed: false };
  const address = profile.address ? guessThaiAddress(data as ThaiAddressData, profile.address, profile.province) : null;
  return { address, guessed: Boolean(address) };
}
