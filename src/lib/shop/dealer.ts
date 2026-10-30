import { cookies } from 'next/headers';
import { cache } from 'react';
import * as admin from '@/lib/admin/store';
import { getCurrentUser, requireDealerAccess } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import type { Dealer } from '@/lib/db/types';
import { formatThaiAddress, parseThaiAddress } from '@/lib/thai-address';
import { getPartner } from './catalog';
import { AVATAR_NAME } from './uploads';
import type { CatalogProduct, DealerProfile, DealerTier, DealerType, TypeCashPercents, TypePricelists } from './types';
import { isProductVisible, type VisibilityScope } from './visibility';

/** Cookie used by back-office staff to browse the shop as a specific dealer (impersonation). */
export const DEALER_COOKIE = 'proto_dealer';

export const DEFAULT_PROFILE: DealerProfile = {
  dealerId: null,
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
  avatarFile: null,
};

const VALID_TYPES: DealerType[] = ['CAR', 'TRUCK', 'MOTORCYCLE', 'BATTERY', 'WHEEL'];
const VALID_TIERS: DealerTier[] = ['S', 'M', 'L'];

/** Keeps only known families mapped to positive integer pricelist ids. */
export function sanitizeTypePricelists(input: unknown): TypePricelists {
  const out: TypePricelists = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const type of VALID_TYPES) {
    const id = Number((input as Record<string, unknown>)[type]);
    if (Number.isInteger(id) && id > 0) out[type] = id;
  }
  return out;
}

/** Keeps only known families mapped to a cash discount % from 0 to 50 (0 = no discount). */
export function sanitizeTypeCashPercents(input: unknown): TypeCashPercents {
  const out: TypeCashPercents = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const type of VALID_TYPES) {
    const raw = (input as Record<string, unknown>)[type];
    if (raw === null || raw === undefined || raw === '') continue;
    const percent = Number(raw);
    if (Number.isFinite(percent) && percent >= 0 && percent <= 50) out[type] = Math.round(percent * 100) / 100;
  }
  return out;
}

/** Cash % of each family's own pricelist; families without a pricelist or a % are left out. */
export function cashPercentsFor(typePricelists: TypePricelists, percents: admin.AdminShape['cashPercents']): TypeCashPercents {
  const out: TypeCashPercents = {};
  for (const [type, id] of Object.entries(typePricelists) as [DealerType, number][]) {
    const percent = admin.cashPercentFor(id, percents);
    if (percent !== null) out[type] = percent;
  }
  return out;
}

/** Cash pricelist paired with each family pricelist; families without a pair are left out. */
function cashPricelistsFor(typePricelists: TypePricelists, pairs: admin.AdminShape['cashPairs']): TypePricelists {
  const out: TypePricelists = {};
  for (const [type, id] of Object.entries(typePricelists) as [DealerType, number][]) {
    const cash = admin.cashPricelistFor(id, pairs);
    if (cash) out[type] = cash;
  }
  return out;
}

/** Validates an untrusted object into a DealerProfile, falling back to defaults per field. */
export function sanitizeProfile(input: Partial<DealerProfile> | null | undefined): DealerProfile {
  const types = Array.isArray(input?.types) ? input.types.filter((t): t is DealerType => VALID_TYPES.includes(t as DealerType)) : [];
  const pricelistId = Number(input?.pricelistId);
  return {
    dealerId: typeof input?.dealerId === 'string' && input.dealerId ? input.dealerId.slice(0, 40) : null,
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
    typePricelists: sanitizeTypePricelists(input?.typePricelists),
    typeCashPricelists: sanitizeTypePricelists(input?.typeCashPricelists),
    cashPercent: typeof input?.cashPercent === 'number' && input.cashPercent > 0 && input.cashPercent <= 50 ? input.cashPercent : null,
    typeCashPercents: sanitizeTypeCashPercents(input?.typeCashPercents),
    dealerCashPercents: sanitizeTypeCashPercents(input?.dealerCashPercents),
    customerGroupId: typeof input?.customerGroupId === 'string' && input.customerGroupId ? input.customerGroupId.slice(0, 40) : null,
    avatarFile: typeof input?.avatarFile === 'string' && AVATAR_NAME.test(input.avatarFile) ? input.avatarFile : null,
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

/** Serializes a profile for cookie storage (impersonation). Resolved book/group/product discounts are left out. */
export function encodeProfile(profile: DealerProfile): string {
  const { priceBook: _book, customerGroup: _group, productCashDiscounts: _discounts, ...stored } = profile;
  return Buffer.from(JSON.stringify(stored), 'utf8').toString('base64url');
}

/** Attaches the published price book, customer group and (credit dealers) product cash discounts from the current admin settings. */
export function withAdminSettings(profile: DealerProfile, data: admin.AdminShape): DealerProfile {
  const book = profile.priceBookId ? data.books.find((b) => b.id === profile.priceBookId) : undefined;
  const group = profile.customerGroupId ? data.groups.find((g) => g.id === profile.customerGroupId) : undefined;
  return { ...profile, priceBook: book?.status === 'PUBLISHED' ? book : null, customerGroup: group ?? null, productCashDiscounts: profile.credit ? data.productCashDiscounts : {} };
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
 * the published web price book for its zone, plus the Odoo pricelist of the linked partner,
 * the per-family pricelists set on the dealer and, for credit dealers, the cash % and the cash pricelists paired with them.
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
      const partner = await getPartner(dealer.odooPartnerId);
      if (partner?.property_product_pricelist) pricelistId = partner.property_product_pricelist[0];
      if (!address && partner) address = [partner.street, partner.city, partner.zip].filter(Boolean).join(' ');
    } catch {
      // Odoo unavailable: keep defaults so the shop still renders.
    }
  }
  const typePricelists = sanitizeTypePricelists(dealer.typePricelists);
  return withAdminSettings(sanitizeProfile({
    dealerId: dealer.id,
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
    typePricelists,
    typeCashPricelists: dealer.creditEnabled ? cashPricelistsFor(typePricelists, data.cashPairs) : {},
    cashPercent: dealer.creditEnabled ? admin.cashPercentFor(pricelistId, data.cashPercents) : null,
    typeCashPercents: dealer.creditEnabled ? cashPercentsFor(typePricelists, data.cashPercents) : {},
    dealerCashPercents: dealer.creditEnabled ? sanitizeTypeCashPercents(dealer.typeCashPercents) : {},
    customerGroupId: admin.groupForDealerIn(data, dealer.id)?.id ?? null,
    avatarFile: dealer.avatarFile ?? null,
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
