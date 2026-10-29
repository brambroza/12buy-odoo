import { cookies } from 'next/headers';
import { cache } from 'react';
import * as admin from '@/lib/admin/store';
import { getCurrentUser, requireDealerAccess } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import type { Dealer } from '@/lib/db/types';
import { formatThaiAddress, parseThaiAddress } from '@/lib/thai-address';
import { getPartners } from './catalog';
import type { CatalogProduct, DealerProfile, DealerTier, DealerType } from './types';
import { isProductVisible, type VisibilityScope } from './visibility';

/** Cookie used by back-office staff to browse the shop as a specific dealer (impersonation). */
export const DEALER_COOKIE = 'proto_dealer';

export const DEFAULT_PROFILE: DealerProfile = {
  name: 'ร้านตัวอย่างการยาง (เดโม)',
  types: ['CAR', 'TRUCK'],
  tier: 'M',
  province: 'กรุงเทพมหานคร',
  pricelistId: 9,
  address: '123 ถ.ตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10100',
  shipping: null,
  phone: '',
  priceBookId: null,
  odooPartnerId: null,
  credit: false,
  cashPricelistId: null,
  customerGroupId: null,
};

const VALID_TYPES: DealerType[] = ['CAR', 'TRUCK', 'MOTORCYCLE', 'BATTERY', 'WHEEL'];
const VALID_TIERS: DealerTier[] = ['S', 'M', 'L'];

/** Validates an untrusted object into a DealerProfile, falling back to defaults per field. */
export function sanitizeProfile(input: Partial<DealerProfile> | null | undefined): DealerProfile {
  const types = Array.isArray(input?.types) ? input.types.filter((t): t is DealerType => VALID_TYPES.includes(t as DealerType)) : [];
  const pricelistId = Number(input?.pricelistId);
  return {
    name: typeof input?.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : DEFAULT_PROFILE.name,
    types: types.length ? types : DEFAULT_PROFILE.types,
    tier: VALID_TIERS.includes(input?.tier as DealerTier) ? (input!.tier as DealerTier) : DEFAULT_PROFILE.tier,
    province: typeof input?.province === 'string' && input.province ? input.province.slice(0, 60) : DEFAULT_PROFILE.province,
    pricelistId: Number.isInteger(pricelistId) && pricelistId > 0 ? pricelistId : DEFAULT_PROFILE.pricelistId,
    address: typeof input?.address === 'string' ? input.address.slice(0, 300) : '',
    shipping: parseThaiAddress(input?.shipping),
    phone: typeof input?.phone === 'string' ? input.phone.slice(0, 30) : '',
    priceBookId: typeof input?.priceBookId === 'string' && input.priceBookId ? input.priceBookId.slice(0, 40) : null,
    odooPartnerId: Number.isInteger(input?.odooPartnerId) && (input!.odooPartnerId as number) > 0 ? (input!.odooPartnerId as number) : null,
    credit: input?.credit === true,
    cashPricelistId: Number.isInteger(input?.cashPricelistId) && (input!.cashPricelistId as number) > 0 ? (input!.cashPricelistId as number) : null,
    customerGroupId: typeof input?.customerGroupId === 'string' && input.customerGroupId ? input.customerGroupId.slice(0, 40) : null,
  };
}

/**
 * Visibility scope for a profile. The group is resolved from the admin settings on every
 * request (see `withAdminSettings`), so changes apply at once, also to impersonating staff.
 */
export function visibilityScope(profile: Pick<DealerProfile, 'types' | 'customerGroup'>): VisibilityScope {
  return { types: profile.types, group: profile.customerGroup ?? null };
}

/** Whether the dealer may see and order this product (family + customer group). */
export function canSeeProduct(profile: Pick<DealerProfile, 'types' | 'customerGroup'>, product: CatalogProduct): boolean {
  return isProductVisible(product, visibilityScope(profile));
}

/** Serializes a profile for cookie storage (impersonation). Resolved book/group are left out. */
export function encodeProfile(profile: DealerProfile): string {
  const { priceBook: _book, customerGroup: _group, ...stored } = profile;
  return Buffer.from(JSON.stringify(stored), 'utf8').toString('base64url');
}

/** Attaches the published price book and customer group from the current admin settings. */
export function withAdminSettings(profile: DealerProfile, data: admin.AdminShape): DealerProfile {
  const book = profile.priceBookId ? data.books.find((b) => b.id === profile.priceBookId) : undefined;
  const group = profile.customerGroupId ? data.groups.find((g) => g.id === profile.customerGroupId) : undefined;
  return { ...profile, priceBook: book?.status === 'PUBLISHED' ? book : null, customerGroup: group ?? null };
}

/** Reads the impersonation cookie, if any. */
async function readImpersonationCookie(): Promise<DealerProfile | null> {
  const store = await cookies();
  const raw = store.get(DEALER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return sanitizeProfile(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

/**
 * Builds the shop profile for a DB dealer: product families, customer group, tier, province and
 * the published web price book for its zone, plus the Odoo pricelist of the linked partner
 * and, for credit dealers, the cash pricelist paired with it.
 */
export async function profileFromDealer(dealer: Dealer, settings?: admin.AdminShape): Promise<DealerProfile> {
  const data = settings ?? await admin.getAdminSnapshot();
  const zone = admin.zoneForProvince(dealer.province, data.zones);
  const book = admin.findBookIn(data, zone.id, dealer.tier as DealerTier);
  let pricelistId = DEFAULT_PROFILE.pricelistId;
  const shipping = parseThaiAddress(dealer.shippingAddress);
  let address = shipping ? formatThaiAddress(shipping) : dealer.address ?? '';
  if (dealer.odooPartnerId) {
    try {
      const partner = (await getPartners()).find((p) => p.id === dealer.odooPartnerId);
      if (partner?.property_product_pricelist) pricelistId = partner.property_product_pricelist[0];
      if (!address && partner) address = [partner.street, partner.city, partner.zip].filter(Boolean).join(' ');
    } catch {
      // Odoo unavailable: keep defaults so the shop still renders.
    }
  }
  return withAdminSettings(sanitizeProfile({
    name: dealer.name,
    types: dealer.types as DealerType[],
    tier: dealer.tier as DealerTier,
    province: dealer.province,
    pricelistId,
    address,
    shipping,
    phone: dealer.phone ?? '',
    priceBookId: book?.status === 'PUBLISHED' ? book.id : null,
    odooPartnerId: dealer.odooPartnerId,
    credit: dealer.creditEnabled,
    cashPricelistId: dealer.creditEnabled ? admin.cashPricelistFor(pricelistId, data.cashPairs) : null,
    customerGroupId: admin.groupForDealerIn(data, dealer.id)?.id ?? null,
  }), data);
}

/**
 * Profile of the dealer currently using the shop.
 * Dealers: from their DB record (must be ACTIVE). Back-office staff: from the
 * impersonation cookie set by "เปิดมุมมองดีลเลอร์", otherwise the demo profile.
 * Redirects to login when nobody is signed in.
 */
export const getDealerProfile = cache(async (): Promise<DealerProfile> => {
  const user = await requireDealerAccess();
  if (user.dealer && !isBackofficeRole(user.role as Role)) return profileFromDealer(user.dealer);
  return withAdminSettings((await readImpersonationCookie()) ?? DEFAULT_PROFILE, await admin.getAdminSnapshot());
});

/** Stable key for carts/orders: the dealer id, or an admin's impersonation target. */
export async function dealerScopeKey(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.dealer && !isBackofficeRole(user.role as Role)) return `dealer:${user.dealer.id}`;
  const imp = await readImpersonationCookie();
  return `staff:${user.id}:${imp?.odooPartnerId ?? 'demo'}`;
}
