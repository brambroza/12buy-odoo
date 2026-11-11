/**
 * Freight discount: baht off the bill per tyre / wheel / pack, set per delivery method and product family
 * at /admin/delivery (e.g. รถบริษัท: TBR −150 /เส้น, PCR −80 /เส้น, กระทะล้อ −100 /วง, motorcycle −80 /มัด).
 * It applies whatever the payment method. The shipping fee itself is never on the web bill: the company
 * bills it separately. Pure functions shared by the cart, checkout, admin page and tests.
 */
import type { CatalogProduct, DealerType } from './types';
import { DEALER_TYPE_LABELS } from './types';
import { baseUnitLabel } from './units';

/** Baht off per unit (see `freightUnitLabel`) for each family; a missing family = no discount. */
export type FreightRates = Partial<Record<DealerType, number>>;

/** Freight rates per Odoo `delivery.carrier` id (as a string key, stored in the admin settings). */
export type FreightDiscounts = Record<string, FreightRates>;

/** Families whose freight discount counts whole packs (มัด) instead of base units. */
export const FREIGHT_PER_PACK: ReadonlySet<DealerType> = new Set<DealerType>(['MOTORCYCLE']);

/** Order of the families on the admin form and in summaries. */
export const FREIGHT_TYPES: DealerType[] = ['TRUCK', 'CAR', 'WHEEL', 'MOTORCYCLE', 'BATTERY'];

export const MAX_FREIGHT_RATE = 100_000;

/** What one discount unit is for this family: มัด for per-pack families, else the base unit (เส้น / วง / ลูก). */
export function freightUnitLabel(type: DealerType): string {
  return FREIGHT_PER_PACK.has(type) ? 'มัด' : baseUnitLabel(type);
}

/**
 * How many discount units a cart line holds: its base units, or for per-pack families the whole packs
 * (the pack the dealer chose, else the product's smallest Odoo packaging). Loose tyres that do not fill a
 * pack get nothing; a per-pack product without any packaging in Odoo gets nothing.
 */
export function freightCount(product: Pick<CatalogProduct, 'dealerType' | 'units'>, qty: number, unitId?: number | null): number {
  if (qty <= 0) return 0;
  if (!FREIGHT_PER_PACK.has(product.dealerType)) return qty;
  const packs = product.units.filter((u) => u.factor > 1);
  const pack = packs.find((u) => u.id === unitId) ?? [...packs].sort((a, b) => a.factor - b.factor)[0];
  return pack ? Math.floor(qty / pack.factor) : 0;
}

/**
 * Freight discount for one line in baht: count × the family's rate, never negative and never above
 * `cap` (the line amount after any cash discount). 0 when the method has no rate for the family.
 */
export function freightDiscountOf(rates: FreightRates | null | undefined, product: Pick<CatalogProduct, 'dealerType' | 'units'>, qty: number, unitId: number | null | undefined, cap: number): number {
  const rate = rates?.[product.dealerType] ?? 0;
  if (!(rate > 0)) return 0;
  return round2(Math.min(freightCount(product, qty, unitId) * rate, Math.max(cap, 0)));
}

/** Rates of one delivery method, or null when none is set. */
export function freightRatesFor(discounts: FreightDiscounts | null | undefined, carrierId: number | null | undefined): FreightRates | null {
  if (!carrierId) return null;
  const rates = discounts?.[String(carrierId)];
  return rates && Object.keys(rates).length ? rates : null;
}

/** One form value: '' = no discount (null), else a baht amount in (0, MAX_FREIGHT_RATE]; anything else is an error. */
export function parseFreightRate(raw: string): number | null | { error: string } {
  const text = raw.trim().replace(/,/g, '');
  if (!text || text === '0') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return { error: 'ส่วนลดค่าขนส่งต้องเป็นตัวเลขไม่ติดลบ' };
  if (value > MAX_FREIGHT_RATE) return { error: `ส่วนลดค่าขนส่งต้องไม่เกิน ${MAX_FREIGHT_RATE.toLocaleString('th-TH')} บาท` };
  return value === 0 ? null : round2(value);
}

/** Keeps only valid positive rates of known families (for values read back from storage). */
export function cleanFreightRates(input: Partial<Record<string, unknown>> | null | undefined): FreightRates {
  const out: FreightRates = {};
  for (const type of FREIGHT_TYPES) {
    const value = Number(input?.[type]);
    if (Number.isFinite(value) && value > 0 && value <= MAX_FREIGHT_RATE) out[type] = round2(value);
  }
  return out;
}

/** "TBR ฿150 /เส้น · PCR ฿80 /เส้น" style summary for the admin list; '' when no rate is set. */
export function formatFreightRates(rates: FreightRates | null | undefined): string {
  return FREIGHT_TYPES.filter((t) => (rates?.[t] ?? 0) > 0)
    .map((t) => `${DEALER_TYPE_LABELS[t]} ฿${rates![t]!.toLocaleString('th-TH')} /${freightUnitLabel(t)}`)
    .join(' · ');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
