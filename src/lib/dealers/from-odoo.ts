/**
 * Creates web dealers and logins for shops that already exist in Odoo: either verified by tax id +
 * phone (`/activate`) or by signing in with their Odoo portal email + password.
 * New dealers are ACTIVE, tier M and cash-only until an admin enables credit.
 */
import { createUser } from '@/lib/auth/users';
import type { Dealer, DealerType, User } from '@/lib/db/types';
import { odooCheckLogin } from '@/lib/odoo/rpc';
import { findPortalAccount, normalizeTaxId, partnerAddress, phoneKey, type ClaimablePartner } from '@/lib/odoo/partner-claim';
import { PROVINCES } from '@/lib/provinces';
import { RATE_LIMITS, hitRateLimit } from '@/lib/security/rate-limit';
import { shortProvince } from '@/lib/shop/catalog';
import { normalizeThaiPhone } from '@/lib/shop/shipping';
import { DEALER_TYPE_LABELS } from '@/lib/shop/types';
import { createDealer, findDealerByPartnerId, findDealerByTaxId, getDealer, updateDealer } from './repo';

const ALL_TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/**
 * Creates an ACTIVE dealer linked to the Odoo company partner.
 * Returns null when a dealer for this shop already exists: another request linked the same partner
 * first (unique `odooPartnerId`), or a web dealer already carries the partner's tax id (unique `taxId`,
 * e.g. one an admin created by hand without linking it). Callers decide how to report that.
 */
export async function createDealerFromPartner(partner: ClaimablePartner, extra: { types?: DealerType[]; phone?: string; note: string }): Promise<Dealer | null> {
  const province = partner.state_id ? shortProvince(partner.state_id[1]) : '';
  const phone = extra.phone ?? (phoneKey(partner.phone) ? normalizeThaiPhone(partner.phone as string) : null);
  const taxId = normalizeTaxId(partner.vat || '');
  if (taxId && (await findDealerByTaxId(taxId))) return null;
  try {
    const dealer = await createDealer({
      name: partner.name, province: (PROVINCES as readonly string[]).includes(province) ? province : '', types: extra.types ?? ALL_TYPES, tier: 'M',
      status: 'ACTIVE', odooPartnerId: partner.id, phone, taxId, address: partnerAddress(partner), notes: extra.note,
    });
    await updateDealer(dealer.id, { approvedAt: new Date() });
    return dealer;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Returns true when `key` (an IP) may forward another sign-in to Odoo right now: each one is a password guess against Odoo. */
export async function allowOdooLogin(key: string): Promise<boolean> {
  return (await hitRateLimit('odoo-login', key, RATE_LIMITS.odooLogin)).ok;
}

export type OdooLoginOutcome =
  | { kind: 'created'; user: User; dealer: Dealer; odooUid: number; newDealer: boolean }
  | { kind: 'not-portal'; odooUid: number }
  /** A web dealer with the company's tax id exists but is not linked to this Odoo partner; staff must link it. */
  | { kind: 'conflict'; odooUid: number; dealer: Dealer }
  | { kind: 'invalid' };

/**
 * First web sign-in of an Odoo portal user: when Odoo accepts the email + password, create (or reuse)
 * the dealer for their company and a web login with the same password. The first login of a dealer is
 * its owner; later ones are staff. Afterwards the web login stands on its own (Odoo is not asked again).
 * Callers must have checked that no web user has this email.
 */
export async function provisionFromOdooLogin(email: string, password: string): Promise<OdooLoginOutcome> {
  const uid = await odooCheckLogin(email, password);
  if (!uid) return { kind: 'invalid' };
  const account = await findPortalAccount(uid);
  if (!account) return { kind: 'not-portal', odooUid: uid };

  let dealer = await findDealerByPartnerId(account.company.id);
  let newDealer = false;
  if (!dealer) {
    dealer = await createDealerFromPartner(account.company, { note: `สร้างอัตโนมัติจาก portal user Odoo #${uid}` });
    newDealer = !!dealer;
    dealer ??= await findDealerByPartnerId(account.company.id);
    if (!dealer) {
      const taxId = normalizeTaxId(account.company.vat || '');
      const byTaxId = taxId ? await findDealerByTaxId(taxId) : null;
      if (byTaxId) return { kind: 'conflict', odooUid: uid, dealer: byTaxId };
      throw new Error(`dealer for Odoo partner ${account.company.id} not found after create`);
    }
  }

  const hasUsers = !newDealer && ((await getDealer(dealer.id))?.users.length ?? 0) > 0;
  const user = await createUser({ email, name: account.contactName, password, role: hasUsers ? 'DEALER_STAFF' : 'DEALER_OWNER', dealerId: dealer.id });
  return { kind: 'created', user, dealer, odooUid: uid, newDealer };
}
