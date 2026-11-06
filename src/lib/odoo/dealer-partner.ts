/**
 * Links a web dealer to its Odoo customer (`res.partner`, company).
 * One dealer = one partner. Called when a lead is approved, and again before
 * pushing an order for any dealer that still has no partner.
 */
import type { Dealer } from '@/lib/db/types';
import { updateDealer } from '@/lib/dealers/repo';
import { clearPartnerCache } from '@/lib/shop/catalog';
import { parseThaiAddress } from '@/lib/thai-address';
import { normalizeTaxId } from '@/lib/tax-id';
import { odooSearchRead, odooWrite } from './rpc';

const BANGKOK = 'กรุงเทพมหานคร';

type IdName = { id: number; name: string };

/** Odoo stores provinces as `จังหวัดเชียงใหม่`, Bangkok without the prefix. */
export function odooStateName(province: string): string {
  return province === BANGKOK ? province : `จังหวัด${province}`;
}

/**
 * Builds `res.partner` create values from a dealer.
 * `stateId`/`countryId` come from Odoo lookups; `pricelistId` keeps the prices
 * the dealer already sees so linking does not change shop prices.
 */
export function partnerValues(dealer: Dealer, refs: { stateId: number | null; countryId: number | null; pricelistId: number | null }): Record<string, unknown> {
  const shipping = parseThaiAddress(dealer.shippingAddress);
  const values: Record<string, unknown> = {
    name: dealer.name,
    is_company: true,
    customer_rank: 1,
    phone: dealer.phone || false,
    vat: dealer.taxId || false,
    comment: `สร้างจากเว็บดีลเลอร์ (dealer ${dealer.id})`,
  };
  if (shipping) {
    values.street = shipping.line || false;
    values.street2 = [shipping.subdistrict, shipping.district].filter(Boolean).join(' ') || false;
    values.zip = shipping.postalCode || false;
  } else if (dealer.address) {
    values.street = dealer.address;
  }
  if (refs.stateId) values.state_id = refs.stateId;
  if (refs.countryId) values.country_id = refs.countryId;
  if (refs.pricelistId) values.property_product_pricelist = refs.pricelistId;
  return values;
}

/**
 * Existing company partners that are the same shop: same tax id if we have one (Odoo may store it with
 * `TH`, dashes or spaces, so match on the digits), else the exact name.
 */
async function findExistingPartners(dealer: Dealer): Promise<IdName[]> {
  const taxId = normalizeTaxId(dealer.taxId);
  if (taxId) {
    const found = await odooSearchRead<IdName & { vat: string | false }>('res.partner', [['vat', 'ilike', taxId], ['is_company', '=', true]], ['id', 'name', 'vat'], { limit: 10 });
    return found.filter((p) => normalizeTaxId(p.vat || '') === taxId).map(({ id, name }) => ({ id, name }));
  }
  return odooSearchRead<IdName>('res.partner', [['name', '=ilike', dealer.name.trim()], ['is_company', '=', true]], ['id', 'name'], { limit: 3 });
}

async function findStateAndCountry(province: string): Promise<{ stateId: number | null; countryId: number | null }> {
  const [countries, states] = await Promise.all([
    odooSearchRead<IdName>('res.country', [['code', '=', 'TH']], ['id', 'name'], { limit: 1 }),
    odooSearchRead<IdName>('res.country.state', [['country_id.code', '=', 'TH'], ['name', '=', odooStateName(province)]], ['id', 'name'], { limit: 1 }),
  ]);
  return { countryId: countries[0]?.id ?? null, stateId: states[0]?.id ?? null };
}

/**
 * Returns the dealer's Odoo partner id, linking or creating it when missing:
 * reuse a single matching company partner, refuse to guess between several,
 * otherwise create a new one. The id is saved on the dealer.
 *
 * @param pricelistId pricelist to set on a new partner (the one the shop already uses)
 */
export async function ensureDealerPartner(dealer: Dealer, pricelistId: number | null): Promise<number> {
  if (dealer.odooPartnerId) return dealer.odooPartnerId;

  const matches = await findExistingPartners(dealer);
  if (matches.length > 1) {
    throw new Error(`พบลูกค้าใน Odoo ชื่อซ้ำ ${matches.length} ราย (${matches.map((m) => `#${m.id}`).join(', ')}) กรุณาเลือกผูกเองในหน้าดีลเลอร์`);
  }

  let partnerId = matches[0]?.id;
  if (!partnerId) {
    const refs = await findStateAndCountry(dealer.province);
    const created = await odooWrite<number | number[]>('res.partner', 'create', [[partnerValues(dealer, { ...refs, pricelistId })]]);
    partnerId = Array.isArray(created) ? created[0] : created;
  }

  await updateDealer(dealer.id, { odooPartnerId: partnerId });
  clearPartnerCache();
  return partnerId;
}

/** Outcome of matching one unlinked dealer to Odoo: linked to a partner, several candidates, or none found. */
export type DealerLinkResult =
  | { dealerId: string; name: string; kind: 'linked'; partnerId: number }
  | { dealerId: string; name: string; kind: 'ambiguous'; partnerIds: number[] }
  | { dealerId: string; name: string; kind: 'taken'; partnerId: number; takenBy: string }
  | { dealerId: string; name: string; kind: 'none' };

/**
 * Links each unlinked dealer to the one Odoo company with its tax id (or exact name when it has none).
 * Read-only on Odoo, never creates a partner. A partner already linked to another dealer is left alone,
 * as are dealers with several candidates: the admin picks those in the dealer form.
 */
export async function linkDealersToOdoo(dealers: Dealer[], linked: Map<number, string>): Promise<DealerLinkResult[]> {
  const taken = new Map(linked);
  const results: DealerLinkResult[] = [];
  for (const dealer of dealers) {
    if (dealer.odooPartnerId) continue;
    const base = { dealerId: dealer.id, name: dealer.name };
    const matches = await findExistingPartners(dealer);
    if (!matches.length) { results.push({ ...base, kind: 'none' }); continue; }
    if (matches.length > 1) { results.push({ ...base, kind: 'ambiguous', partnerIds: matches.map((m) => m.id) }); continue; }
    const partnerId = matches[0].id;
    const takenBy = taken.get(partnerId);
    if (takenBy) { results.push({ ...base, kind: 'taken', partnerId, takenBy }); continue; }
    await updateDealer(dealer.id, { odooPartnerId: partnerId });
    taken.set(partnerId, dealer.name);
    results.push({ ...base, kind: 'linked', partnerId });
  }
  if (results.some((r) => r.kind === 'linked')) clearPartnerCache();
  return results;
}
