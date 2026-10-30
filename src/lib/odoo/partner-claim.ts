/**
 * Lets an existing Odoo customer open its own web account: the shop proves who it is with
 * its tax id plus a phone number that both match the company partner in Odoo. Read-only on Odoo.
 */
import { normalizeThaiPhone } from '@/lib/shop/shipping';
import { normalizeTaxId } from '@/lib/tax-id';
import { odooRead, odooSearchRead } from './rpc';

/** Company partner fields the web needs to create the dealer. */
export type ClaimablePartner = {
  id: number;
  name: string;
  vat: string | false;
  phone: string | false;
  mobile?: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  zip: string | false;
  state_id: [number, string] | false;
};

export { normalizeTaxId };

/** Comparable phone: the last 9 digits after `+66` → `0`, so `02-123-4567`, `021234567` and `+6621234567` match. */
export function phoneKey(raw: string | false | null | undefined): string | null {
  if (!raw) return null;
  const digits = normalizeThaiPhone(raw).replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/** True when the typed phone equals the partner's phone or mobile. */
export function phoneMatches(partner: Pick<ClaimablePartner, 'phone' | 'mobile'>, phone: string): boolean {
  const key = phoneKey(phone);
  return !!key && [partner.phone, partner.mobile].some((p) => phoneKey(p) === key);
}

let hasMobile: boolean | null = null;

/** Odoo 19 dropped `res.partner.mobile`; ask once instead of failing the read. */
async function partnerHasMobile(): Promise<boolean> {
  if (hasMobile === null) {
    const fields = await odooRead<Record<string, unknown>>('res.partner', 'fields_get', [['mobile']], { attributes: ['type'] });
    hasMobile = 'mobile' in fields;
  }
  return hasMobile;
}

/**
 * The one company customer whose tax id and phone both match, or null.
 * Several matches (e.g. branches sharing a tax id and phone) are refused rather than guessed.
 */
export async function findClaimablePartner(taxId: string, phone: string): Promise<ClaimablePartner | null> {
  const fields = [...PARTNER_FIELDS];
  if (await partnerHasMobile()) fields.push('mobile');
  const candidates = await odooSearchRead<ClaimablePartner>('res.partner',
    [['vat', 'ilike', taxId], ['parent_id', '=', false], ['customer_rank', '>', 0]], fields, { limit: 20 });
  const matches = candidates.filter((p) => normalizeTaxId(p.vat || '') === taxId && phoneMatches(p, phone));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The company customers in Odoo with this tax id (13 digits). Used by the sign-up form to tell an
 * existing customer to activate its account instead of applying again. Read-only on Odoo.
 */
export async function findPartnersByTaxId(taxId: string): Promise<Pick<ClaimablePartner, 'id' | 'name'>[]> {
  const candidates = await odooSearchRead<Pick<ClaimablePartner, 'id' | 'name' | 'vat'>>('res.partner',
    [['vat', 'ilike', taxId], ['parent_id', '=', false], ['customer_rank', '>', 0]], ['id', 'name', 'vat'], { limit: 20 });
  return candidates.filter((p) => normalizeTaxId(p.vat || '') === taxId).map(({ id, name }) => ({ id, name }));
}

/** One-line address from the partner, for `Dealer.address`. */
export function partnerAddress(partner: ClaimablePartner): string | null {
  return [partner.street, partner.street2, partner.city, partner.zip].filter(Boolean).join(' ') || null;
}

/** Test helper. */
export function resetPartnerFieldCache() {
  hasMobile = null;
}

const PARTNER_FIELDS = ['id', 'name', 'vat', 'phone', 'street', 'street2', 'city', 'zip', 'state_id'];

/** A portal user in Odoo and the company (commercial partner) they buy for. */
export type PortalAccount = { uid: number; contactName: string; company: ClaimablePartner };

/**
 * Resolves an Odoo user id to its company, only for portal users (`share`): internal staff
 * logins never become dealers.
 */
export async function findPortalAccount(uid: number): Promise<PortalAccount | null> {
  const [user] = await odooSearchRead<{ id: number; share: boolean; partner_id: [number, string] | false }>('res.users',
    [['id', '=', uid]], ['id', 'share', 'partner_id'], { limit: 1 });
  if (!user?.share || !user.partner_id) return null;
  const [contact] = await odooSearchRead<{ id: number; name: string; commercial_partner_id: [number, string] | false }>('res.partner',
    [['id', '=', user.partner_id[0]]], ['id', 'name', 'commercial_partner_id'], { limit: 1 });
  if (!contact) return null;
  const companyId = contact.commercial_partner_id ? contact.commercial_partner_id[0] : contact.id;
  const [company] = await odooSearchRead<ClaimablePartner>('res.partner', [['id', '=', companyId]], PARTNER_FIELDS, { limit: 1 });
  return company ? { uid, contactName: contact.name, company } : null;
}
