/**
 * Admin view of Odoo customers (company contacts) with the settings the back office may change
 * on them: the pricelist (`property_product_pricelist`, the dealer's price group), the credit limit
 * (`credit_limit` + `use_partner_credit_limit`) and the delivery method used for their web orders
 * (`property_delivery_carrier_id`). Writes go through `odooWrite`, so they only run when
 * `ODOO_READ_ONLY=false`, and the write guard refuses any other partner field.
 */
import { z } from 'zod';
import { odooSearchRead, odooWrite } from './rpc';

export type OdooCustomer = {
  id: number;
  name: string;
  vat: string | null;
  phone: string | null;
  email: string | null;
  province: string | null;
  pricelist: { id: number; name: string } | null;
  /** Partner credit limit; null when Odoo applies no partner-specific limit. */
  creditLimit: number | null;
  /** Total receivable (unpaid invoices) from Odoo. */
  receivable: number;
  salesperson: string | null;
  /** Delivery method the admin assigned; the dealer's web orders use it. */
  carrier: { id: number; name: string } | null;
};

export type OdooPricelistOption = { id: number; name: string };

type RawCustomer = {
  id: number;
  name: string;
  vat: string | false;
  phone: string | false;
  email: string | false;
  state_id: [number, string] | false;
  property_product_pricelist: [number, string] | false;
  credit_limit: number;
  use_partner_credit_limit: boolean;
  credit: number;
  user_id: [number, string] | false;
  property_delivery_carrier_id?: [number, string] | false;
};

const CUSTOMER_FIELDS = ['id', 'name', 'vat', 'phone', 'email', 'state_id', 'property_product_pricelist', 'credit_limit', 'use_partner_credit_limit', 'credit', 'user_id', 'property_delivery_carrier_id'];
/**
 * Company-level customers only: contacts under a company (parent_id set) share the company's settings.
 * A portal user's contact counts too, even before its first sale order gives it a customer rank.
 */
export const CUSTOMER_DOMAIN = [['parent_id', '=', false], '|', ['customer_rank', '>', 0], ['user_ids.share', '=', true]];

/** Maps an Odoo row to the admin shape. A limit counts only when "Partner Limit" is on and above 0. */
export function toOdooCustomer(raw: RawCustomer): OdooCustomer {
  return {
    id: raw.id,
    name: raw.name,
    vat: raw.vat || null,
    phone: raw.phone || null,
    email: raw.email || null,
    province: raw.state_id ? raw.state_id[1].replace(/\s*\(TH\)$/, '').replace(/^จังหวัด/, '') : null,
    pricelist: raw.property_product_pricelist ? { id: raw.property_product_pricelist[0], name: raw.property_product_pricelist[1] } : null,
    creditLimit: raw.use_partner_credit_limit && raw.credit_limit > 0 ? raw.credit_limit : null,
    receivable: Math.max(0, Number(raw.credit) || 0),
    salesperson: raw.user_id ? raw.user_id[1] : null,
    carrier: raw.property_delivery_carrier_id ? { id: raw.property_delivery_carrier_id[0], name: raw.property_delivery_carrier_id[1] } : null,
  };
}

/** Every company customer in Odoo, live (not cached, so a save shows up at once). */
export async function listOdooCustomers(): Promise<OdooCustomer[]> {
  const rows = await odooSearchRead<RawCustomer>('res.partner', CUSTOMER_DOMAIN, CUSTOMER_FIELDS, { limit: 2000, order: 'name asc' });
  return rows.map(toOdooCustomer);
}

/** One company customer, or null when the id is not a company customer. */
export async function getOdooCustomer(partnerId: number): Promise<OdooCustomer | null> {
  const [row] = await odooSearchRead<RawCustomer>('res.partner', [['id', '=', partnerId], ...CUSTOMER_DOMAIN], CUSTOMER_FIELDS, { limit: 1 });
  return row ? toOdooCustomer(row) : null;
}

/**
 * What a dealer's linked Odoo partner is: a company customer (managed here: pricelist, credit limit, delivery),
 * a plain contact (no customer rank, or a person under a company, which uses the company's settings),
 * archived, or missing (deleted / wrong id).
 */
export type OdooPartnerKind =
  | { kind: 'customer' }
  | { kind: 'contact'; parent: { id: number; name: string } | null }
  | { kind: 'archived' }
  | { kind: 'missing' };

type RawPartnerKind = { id: number; active: boolean; customer_rank: number; parent_id: [number, string] | false };

/** Classifies one res.partner row; `undefined` (not returned by Odoo) is missing. */
export function partnerKind(raw: RawPartnerKind | undefined): OdooPartnerKind {
  if (!raw) return { kind: 'missing' };
  if (!raw.active) return { kind: 'archived' };
  if (raw.parent_id) return { kind: 'contact', parent: { id: raw.parent_id[0], name: raw.parent_id[1] } };
  return raw.customer_rank > 0 ? { kind: 'customer' } : { kind: 'contact', parent: null };
}

/** Kind of each given partner id, read in one call (archived partners included). */
export async function getOdooPartnerKinds(partnerIds: number[]): Promise<Map<number, OdooPartnerKind>> {
  const ids = [...new Set(partnerIds.filter((id) => Number.isInteger(id) && id > 0))];
  const kinds = new Map<number, OdooPartnerKind>();
  if (!ids.length) return kinds;
  const rows = await odooSearchRead<RawPartnerKind>('res.partner', [['id', 'in', ids], ['active', 'in', [true, false]]],
    ['id', 'active', 'customer_rank', 'parent_id'], { limit: ids.length });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) kinds.set(id, partnerKind(byId.get(id)));
  return kinds;
}

/** Active Odoo pricelists an admin may assign. */
export function listOdooPricelists(): Promise<OdooPricelistOption[]> {
  return odooSearchRead<OdooPricelistOption>('product.pricelist', [], ['id', 'name'], { limit: 200, order: 'name asc' });
}

/** `carrierId`: delivery method to assign, null clears it, undefined leaves it as is. */
export type CustomerPricingUpdate = { pricelistId: number; creditLimit: number | null; carrierId?: number | null };

const pricingFormSchema = z.object({
  pricelistId: z.coerce.number({ message: 'เลือกกลุ่มราคา' }).int().positive('เลือกกลุ่มราคา'),
  /** Baht typed by an admin ("50,000" is fine); blank or 0 = no partner limit. Two decimals. */
  creditLimit: z.string().trim().transform((value, ctx) => {
    const text = value.replace(/,/g, '');
    if (!text) return null;
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999_999) {
      ctx.addIssue({ code: 'custom', message: 'วงเงินเครดิตไม่ถูกต้อง (ต้องเป็นตัวเลขไม่ติดลบ)' });
      return z.NEVER;
    }
    const rounded = Math.round(amount * 100) / 100;
    return rounded > 0 ? rounded : null;
  }),
});

/**
 * Validates the admin form. `pricelistIds` are the pricelists that exist in Odoo, so a tampered
 * id cannot be written. Returns the update or the first Thai error message.
 */
export function parseCustomerPricingForm(input: { pricelistId: string; creditLimit: string }, pricelistIds: ReadonlySet<number>):
  { ok: true; update: CustomerPricingUpdate } | { ok: false; error: string } {
  const parsed = pricingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  if (!pricelistIds.has(parsed.data.pricelistId)) return { ok: false, error: 'ไม่พบกลุ่มราคานี้ใน Odoo' };
  return { ok: true, update: parsed.data };
}

/**
 * Delivery method chosen in the admin form: '' = none (null); otherwise it must be in `carrierIds`
 * (active methods plus the customer's current one), so a tampered id cannot be written.
 */
export function parseCustomerCarrier(value: string, carrierIds: ReadonlySet<number>): { ok: true; carrierId: number | null } | { ok: false; error: string } {
  if (!value.trim()) return { ok: true, carrierId: null };
  const id = Number(value);
  if (!Number.isInteger(id) || !carrierIds.has(id)) return { ok: false, error: 'ไม่พบการจัดส่งนี้ใน Odoo (อาจถูกปิดใช้งาน)' };
  return { ok: true, carrierId: id };
}

/** `res.partner.write` values for an update: a null/0 limit turns the partner limit off. */
export function partnerPricingValues(update: CustomerPricingUpdate): Record<string, unknown> {
  return {
    property_product_pricelist: update.pricelistId,
    ...partnerCreditLimitValues(update.creditLimit),
    ...(update.carrierId !== undefined ? { property_delivery_carrier_id: update.carrierId ?? false } : {}),
  };
}

/** Writes the pricelist, credit limit and (when given) delivery method to the Odoo partner. Throws when Odoo writes are off. */
export async function updateOdooCustomerPricing(partnerId: number, update: CustomerPricingUpdate): Promise<void> {
  await odooWrite<boolean>('res.partner', 'write', [[partnerId], partnerPricingValues(update)]);
}

/** `res.partner.write` values for the credit limit alone: null/0 turns the partner limit off. */
export function partnerCreditLimitValues(creditLimit: number | null): Record<string, unknown> {
  const limited = creditLimit !== null && creditLimit > 0;
  return { use_partner_credit_limit: limited, credit_limit: limited ? creditLimit : 0 };
}

/** Writes only the credit limit to the Odoo partner (the dealer form's web limit). Throws when Odoo writes are off. */
export async function updateOdooCustomerCreditLimit(partnerId: number, creditLimit: number | null): Promise<void> {
  await odooWrite<boolean>('res.partner', 'write', [[partnerId], partnerCreditLimitValues(creditLimit)]);
}
