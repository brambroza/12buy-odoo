/**
 * Delivery methods (`delivery.carrier`) for checkout and the admin page.
 * Odoo is the source of truth. Dealers do not choose: each order uses the method the admin set on
 * the Odoo customer (`property_delivery_carrier_id`), else the first published one. The admin page
 * adds, renames, reorders, publishes and archives methods in Odoo. Methods are free (fixed price 0):
 * the web bill has no shipping line, so the SO only carries `carrier_id`.
 */
import { odooSearchRead, odooWrite } from './rpc';

export type DeliveryCarrier = { id: number; name: string; sequence: number; active: boolean; published: boolean; productId: number | null; productName: string };

type RawCarrier = { id: number; name: string; sequence: number; active: boolean; is_published: boolean; product_id: [number, string] | false };

const FIELDS = ['id', 'name', 'sequence', 'active', 'is_published', 'product_id'];
const ORDER = 'sequence asc, name asc';

function toCarrier(row: RawCarrier): DeliveryCarrier {
  return {
    id: row.id,
    name: row.name,
    sequence: row.sequence,
    active: row.active,
    published: row.is_published,
    productId: row.product_id ? row.product_id[0] : null,
    productName: row.product_id ? row.product_id[1] : '',
  };
}

/** Every delivery method, archived ones included, for the admin page (not cached). */
export async function listAllCarriers(): Promise<DeliveryCarrier[]> {
  const rows = await odooSearchRead<RawCarrier>('delivery.carrier', [], FIELDS, { order: ORDER, limit: 2000, context: { active_test: false } });
  return rows.map(toCarrier);
}

/** Active methods published for the web, in Odoo's order. */
export async function listPublishedCarriers(): Promise<DeliveryCarrier[]> {
  const rows = await odooSearchRead<RawCarrier>('delivery.carrier', [['is_published', '=', true]], FIELDS, { order: ORDER, limit: 500 });
  return rows.map(toCarrier);
}

/** One active method by id, or null (archived or missing). */
export async function getCarrier(id: number): Promise<DeliveryCarrier | null> {
  const [row] = await odooSearchRead<RawCarrier>('delivery.carrier', [['id', '=', id]], FIELDS, { limit: 1 });
  return row ? toCarrier(row) : null;
}

/** Active method with exactly this name, for orders placed before the web stored the method id. */
export async function findCarrierByName(name: string): Promise<DeliveryCarrier | null> {
  const [row] = await odooSearchRead<RawCarrier>('delivery.carrier', [['name', '=', name]], FIELDS, { limit: 1, order: ORDER });
  return row ? toCarrier(row) : null;
}

/**
 * Method used for a dealer's orders: the one the admin assigned to the Odoo customer, else the
 * first published method (lowest sequence). `assigned` tells the checkout which case it is.
 */
export function pickDealerCarrier(partnerDefault: DeliveryCarrier | null, published: DeliveryCarrier[]): { carrier: DeliveryCarrier; assigned: boolean } | null {
  if (partnerDefault?.active) return { carrier: partnerDefault, assigned: true };
  return published[0] ? { carrier: published[0], assigned: false } : null;
}

/**
 * Delivery products in use with how many methods use each, most used first.
 * A new method needs one (`product_id` is required), so the admin picks from these.
 */
export function deliveryProducts(carriers: DeliveryCarrier[]): { id: number; name: string; count: number }[] {
  const byId = new Map<number, { id: number; name: string; count: number }>();
  for (const c of carriers) {
    if (!c.productId) continue;
    const entry = byId.get(c.productId) ?? { id: c.productId, name: c.productName, count: 0 };
    entry.count += 1;
    byId.set(c.productId, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.id - b.id);
}

export type CarrierInput = { name: string; sequence: number; published: boolean };

/** Creates a free fixed-price delivery method in Odoo and returns its id. */
export async function createCarrier(input: CarrierInput & { productId: number }): Promise<number> {
  const created = await odooWrite<number | number[]>('delivery.carrier', 'create', [[{
    name: input.name,
    sequence: input.sequence,
    is_published: input.published,
    delivery_type: 'fixed',
    fixed_price: 0,
    product_id: input.productId,
  }]]);
  return Array.isArray(created) ? created[0] : created;
}

/** Renames / reorders / publishes a delivery method. */
export async function updateCarrier(id: number, input: Partial<CarrierInput>): Promise<void> {
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.sequence !== undefined) values.sequence = input.sequence;
  if (input.published !== undefined) values.is_published = input.published;
  await odooWrite<boolean>('delivery.carrier', 'write', [[id], values]);
}

/** Archives (hides everywhere in Odoo) or restores a delivery method. Archiving also unpublishes it. */
export async function setCarrierActive(id: number, active: boolean): Promise<void> {
  await odooWrite<boolean>('delivery.carrier', 'write', [[id], active ? { active: true } : { active: false, is_published: false }]);
}
