/**
 * Carts and web orders in Supabase (`ShopCart`, `ShopOrder`).
 * Nothing here touches Odoo; the Odoo push lives in `odoo-sync.ts` and only records its result here.
 * Status changes use optimistic locking on the current status, so a double click never skips a step.
 */
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';
import { DbError, parseTimestamp, quoteFilterValue, unwrap } from '@/lib/db/rows';
import { canPayCredit } from './credit-payment';
import type { CartItem, CreditPayment, CreditPaymentOdooLog, OdooSync, OrderActor, OrderStatus, ProtoOrder } from './types';
import { ORDER_STATUS_FLOW } from './types';

type OrderRow = {
  id: string; ref: string; scope: string; dealerName: string; status: OrderStatus; paymentMethod: ProtoOrder['paymentMethod'];
  subtotal: number | string; cashDiscount: number | string; couponDiscount: number | string; total: number | string;
  lines: ProtoOrder['lines']; coupon: ProtoOrder['coupon']; odooPricelistId: number | null; address: string; carrier: string; carrierId?: number | null; note: string;
  poRef: string | null; trackingRef: string | null; payment: ProtoOrder['payment']; events: ProtoOrder['events']; odoo: OdooSync | null; createdAt: string;
};

/** Thrown by `createOrder` when the cart is already empty (e.g. the same checkout submitted twice). */
export class CartEmptyError extends Error {
  constructor() {
    super('CART_EMPTY');
    this.name = 'CartEmptyError';
  }
}

const iso = (value: string) => parseTimestamp(value).toISOString();
const money = (value: number | string) => Number(value);

function toOrder(row: OrderRow): ProtoOrder {
  return {
    id: row.id,
    ref: row.ref,
    sessionId: row.scope,
    dealerName: row.dealerName,
    status: row.status,
    lines: row.lines,
    subtotal: money(row.subtotal),
    cashDiscount: money(row.cashDiscount),
    coupon: row.coupon ?? null,
    couponDiscount: money(row.couponDiscount),
    total: money(row.total),
    odooPricelistId: row.odooPricelistId,
    paymentMethod: row.paymentMethod,
    address: row.address,
    carrier: row.carrier,
    carrierId: row.carrierId ?? null,
    note: row.note,
    poRef: row.poRef ?? undefined,
    trackingRef: row.trackingRef,
    payment: row.payment,
    createdAt: iso(row.createdAt),
    events: row.events,
    odoo: row.odoo ?? undefined,
  };
}

const nowIso = () => new Date().toISOString();

// ---------- carts ----------

async function readCart(scope: string): Promise<{ items: CartItem[]; couponCode: string | null }> {
  const row = unwrap(await db().from('ShopCart').select('items, couponCode').eq('scope', scope).maybeSingle()) as { items: CartItem[]; couponCode: string | null } | null;
  return row ?? { items: [], couponCode: null };
}

export async function getCart(sessionId: string): Promise<CartItem[]> {
  return (await readCart(sessionId)).items;
}

export async function setCart(sessionId: string, items: CartItem[]): Promise<void> {
  unwrap(await db().from('ShopCart').upsert({ scope: sessionId, items: items.filter((item) => item.qty > 0), updatedAt: nowIso() }, { onConflict: 'scope' }));
}

/** Coupon code typed into this cart, if any. */
export async function getCartCoupon(sessionId: string): Promise<string | null> {
  return (await readCart(sessionId)).couponCode;
}

/** Sets (or clears with null) the coupon code of a cart. */
export async function setCartCoupon(sessionId: string, code: string | null): Promise<void> {
  unwrap(await db().from('ShopCart').upsert({ scope: sessionId, couponCode: code || null, updatedAt: nowIso() }, { onConflict: 'scope' }));
}

/** Pure: adds `qty` base units to the product + unit line, or appends one. Exported for tests. */
export function addLine(items: CartItem[], productId: number, qty: number, unit?: { id: number; name: string; factor: number } | null, unitQty?: number | null): CartItem[] {
  const next = items.map((item) => ({ ...item }));
  const unitId = unit && unit.factor > 1 ? unit.id : null;
  const existing = next.find((item) => item.productId === productId && (item.unitId ?? null) === unitId);
  if (existing) {
    existing.qty += qty;
    if (unitId) existing.unitQty = (existing.unitQty ?? 0) + (unitQty ?? 0);
  } else {
    next.push(unitId ? { productId, qty, unitId, unitQty: unitQty ?? null, unitName: unit!.name } : { productId, qty });
  }
  return next;
}

/**
 * Adds quantity (in base units) to the line for this product + unit, or appends one.
 * Lines are keyed by product and chosen unit, so "4 เส้น" and "2 มัด 3 เส้น" stay separate.
 */
export async function addToCart(sessionId: string, productId: number, qty: number, unit?: { id: number; name: string; factor: number } | null, unitQty?: number | null): Promise<void> {
  await setCart(sessionId, addLine(await getCart(sessionId), productId, qty, unit, unitQty));
}

/**
 * Moves a cart line to another unit (เส้น ↔ มัด), keeping the tyre count as close as possible:
 * a pack becomes its exact base count; base units become the nearest whole number of packs (at least 1).
 * Merges into an existing line that already uses the target unit.
 */
export async function changeCartUnit(sessionId: string, productId: number, fromUnitId: number | null, to: { id: number; name: string; factor: number }): Promise<void> {
  const items = await getCart(sessionId);
  const line = items.find((item) => item.productId === productId && (item.unitId ?? null) === fromUnitId);
  const toUnitId = to.factor > 1 ? to.id : null;
  if (!line || fromUnitId === toUnitId) return;
  const unitQty = to.factor > 1 ? Math.max(1, Math.round(line.qty / to.factor)) : line.qty;
  const qty = unitQty * to.factor;
  const rest = items.filter((item) => item !== line);
  const target = rest.find((item) => item.productId === productId && (item.unitId ?? null) === toUnitId);
  if (target) {
    target.qty += qty;
    if (toUnitId) target.unitQty = (target.unitQty ?? 0) + unitQty;
  } else {
    rest.splice(items.indexOf(line), 0, toUnitId ? { productId, qty, unitId: toUnitId, unitQty, unitName: to.name } : { productId, qty });
  }
  await setCart(sessionId, rest);
}

/** Puts a removed line back (undo), at its old position, unless the same product + unit is already back in the cart. */
export async function restoreCartLine(sessionId: string, line: CartItem, index: number): Promise<void> {
  const items = await getCart(sessionId);
  const unitId = line.unitId ?? null;
  if (items.some((item) => item.productId === line.productId && (item.unitId ?? null) === unitId)) return;
  items.splice(Math.max(0, Math.min(index, items.length)), 0, line);
  await setCart(sessionId, items);
}

// ---------- favourites ----------

const MAX_FAVORITES = 200;

/** Product ids the shop marked as favourites, newest first. */
export async function getFavorites(scope: string): Promise<number[]> {
  try {
    const row = unwrap(await db().from('ShopCart').select('favorites').eq('scope', scope).maybeSingle()) as { favorites?: unknown } | null;
    const raw = Array.isArray(row?.favorites) ? row!.favorites : [];
    return raw.filter((id): id is number => Number.isInteger(id));
  } catch (error) {
    // Column missing until migration 20261030220000 is applied: favourites are just empty, the shop keeps working.
    console.warn('[store] favorites unavailable', error instanceof Error ? error.message : error);
    return [];
  }
}

/** Adds or removes a favourite; returns the new state of that product. */
export async function toggleFavorite(scope: string, productId: number): Promise<boolean> {
  const current = await getFavorites(scope);
  const has = current.includes(productId);
  const favorites = (has ? current.filter((id) => id !== productId) : [productId, ...current]).slice(0, MAX_FAVORITES);
  unwrap(await db().from('ShopCart').upsert({ scope, favorites, updatedAt: nowIso() }, { onConflict: 'scope' }));
  return !has;
}

// ---------- orders ----------

export async function listOrders(sessionId: string): Promise<ProtoOrder[]> {
  const rows = unwrap(await db().from('ShopOrder').select('*').eq('scope', sessionId).order('createdAt', { ascending: false })) as OrderRow[];
  return rows.map(toOrder);
}

/** Number of orders still pending for longer than `maxAgeMs` (admin alert). */
export async function countStalePending(maxAgeMs: number, now = Date.now()): Promise<number> {
  const before = new Date(now - maxAgeMs).toISOString();
  const { count, error } = await db().from('ShopOrder').select('id', { count: 'exact', head: true }).eq('status', 'PENDING').lt('createdAt', before);
  if (error) unwrap({ data: null, error });
  return count ?? 0;
}

export type OpenCreditOrder = { scope: string; paymentMethod: string; status: string; total: number };

/**
 * CREDIT orders still holding credit (not PAID, not CANCELLED). With `dealer`, only that dealer's
 * scopes: its logins (`dealer:<id>`) and staff ordering for its Odoo partner (`staff:<user>:<partner>`).
 */
export async function listOpenCreditOrders(dealer?: { id: string; odooPartnerId: number | null }): Promise<OpenCreditOrder[]> {
  let query = db().from('ShopOrder').select('scope, paymentMethod, status, total').eq('paymentMethod', 'CREDIT').not('status', 'in', '("PAID","CANCELLED")');
  if (dealer) {
    const scopes = [`scope.eq.${quoteFilterValue(`dealer:${dealer.id}`)}`];
    if (dealer.odooPartnerId) scopes.push(`scope.like.${quoteFilterValue(`staff:%:${dealer.odooPartnerId}`)}`);
    query = query.or(scopes.join(','));
  }
  const rows = unwrap(await query) as { scope: string; paymentMethod: string; status: string; total: number | string }[];
  return rows.map((r) => ({ ...r, total: money(r.total) }));
}

/** Admin view: every order from every dealer, newest first. */
export async function listAllOrders(): Promise<ProtoOrder[]> {
  const rows = unwrap(await db().from('ShopOrder').select('*').order('createdAt', { ascending: false })) as OrderRow[];
  return rows.map(toOrder);
}

/** One order; `sessionId` null = admin (any dealer). */
export async function getOrder(sessionId: string | null, id: string): Promise<ProtoOrder | undefined> {
  let query = db().from('ShopOrder').select('*').eq('id', id);
  if (sessionId !== null) query = query.eq('scope', sessionId);
  const row = unwrap(await query.maybeSingle()) as OrderRow | null;
  return row ? toOrder(row) : undefined;
}

export type NewOrder = Omit<ProtoOrder, 'id' | 'ref' | 'status' | 'createdAt' | 'events' | 'trackingRef' | 'payment' | 'couponDiscount'> & { couponDiscount?: number };

/**
 * Creates the order and empties the cart in one DB transaction (`place_shop_order`).
 * Throws `CartEmptyError` when the cart was already emptied by a concurrent submit.
 */
export async function createOrder(input: NewOrder): Promise<ProtoOrder> {
  const { sessionId, ...rest } = input;
  const { data, error } = await db().rpc('place_shop_order', { p_order: { ...rest, id: randomUUID().replace(/-/g, ''), scope: sessionId, couponDiscount: input.couponDiscount ?? 0 } });
  if (error) {
    if (error.message.includes('CART_EMPTY')) throw new CartEmptyError();
    throw new DbError(error.message, error.code, error.details);
  }
  return toOrder(data as OrderRow);
}

/**
 * Applies `change` to the order only if its status is still `expected` (optimistic lock).
 * Returns the updated order, or the current one unchanged when the status moved meanwhile.
 */
async function updateIfStatus(order: ProtoOrder, expected: OrderStatus, change: Record<string, unknown>): Promise<ProtoOrder> {
  const row = unwrap(await db().from('ShopOrder').update({ ...change, updatedAt: nowIso() }).eq('id', order.id).eq('status', expected).select('*').maybeSingle()) as OrderRow | null;
  return row ? toOrder(row) : ((await getOrder(null, order.id)) ?? order);
}

/** Dealer attaches a transfer slip (file already stored). Resets verification. */
export async function attachSlip(sessionId: string, id: string, slipFile: string): Promise<ProtoOrder | undefined> {
  const order = await getOrder(sessionId, id);
  if (!order || order.status !== 'PENDING' || order.paymentMethod === 'CREDIT') return order;
  return updateIfStatus(order, 'PENDING', { payment: { ...order.payment, slipFile, slipUploadedAt: nowIso(), verifiedAt: null } });
}

// ---------- credit payments (dealer reports a transfer on a confirmed credit order) ----------

/**
 * Appends a dealer-reported transfer to a confirmed CREDIT order (slip already stored).
 * Returns the order with the new payment, or the unchanged order when it cannot be paid (wrong
 * method/status, or the status moved meanwhile). `sessionId` null = admin on behalf of the dealer.
 */
export async function addCreditPayment(sessionId: string | null, id: string, input: { slipFile: string; amount: number; note: string }): Promise<{ order: ProtoOrder; payment: CreditPayment | null } | undefined> {
  const order = await getOrder(sessionId, id);
  if (!order) return undefined;
  if (!canPayCredit(order)) return { order, payment: null };
  const payment: CreditPayment = { id: randomUUID().replace(/-/g, '').slice(0, 16), slipFile: input.slipFile, amount: input.amount, note: input.note.trim().slice(0, 300), uploadedAt: nowIso(), status: 'PENDING', reviewedAt: null };
  const updated = await updateIfStatus(order, order.status, { payment: { ...order.payment, credits: [...(order.payment.credits ?? []), payment] } });
  const stored = updated.payment.credits?.find((p) => p.id === payment.id) ?? null;
  return { order: updated, payment: stored };
}

/** Admin marks a reported credit payment as checked (VERIFIED) or not acceptable (REJECTED, with a reason). */
export async function reviewCreditPayment(id: string, paymentId: string, status: 'VERIFIED' | 'REJECTED', rejectReason = ''): Promise<{ order: ProtoOrder; payment: CreditPayment | null } | undefined> {
  const order = await getOrder(null, id);
  if (!order) return undefined;
  const current = order.payment.credits?.find((p) => p.id === paymentId);
  if (!current || current.status !== 'PENDING') return { order, payment: null };
  const reviewed: CreditPayment = { ...current, status, reviewedAt: nowIso(), rejectReason: status === 'REJECTED' ? rejectReason.trim().slice(0, 300) || null : null };
  const updated = await updateIfStatus(order, order.status, { payment: { ...order.payment, credits: order.payment.credits!.map((p) => (p.id === paymentId ? reviewed : p)) } });
  const stored = updated.payment.credits?.find((p) => p.id === paymentId) ?? null;
  return { order: updated, payment: stored && stored.status === status ? stored : null };
}

/** Records the result of posting the chatter note for a credit payment (success or error) on that payment. */
export async function setCreditPaymentOdooLog(id: string, paymentId: string, log: CreditPaymentOdooLog): Promise<ProtoOrder | undefined> {
  const order = await getOrder(null, id);
  if (!order?.payment.credits?.some((p) => p.id === paymentId)) return order;
  const credits = order.payment.credits.map((p) => (p.id === paymentId ? { ...p, odoo: log } : p));
  const row = unwrap(await db().from('ShopOrder').update({ payment: { ...order.payment, credits }, updatedAt: nowIso() }).eq('id', id).select('*').maybeSingle()) as OrderRow | null;
  return row ? toOrder(row) : order;
}

/** Credit orders skip the slip; cash orders need a verified slip before confirmation. */
export function isPaymentReady(order: ProtoOrder): boolean {
  return order.paymentMethod === 'CREDIT' || Boolean(order.payment.verifiedAt);
}

/** Admin marks the slip as checked. */
export async function verifySlip(id: string): Promise<ProtoOrder | undefined> {
  const order = await getOrder(null, id);
  if (!order || !order.payment.slipFile) return order;
  return updateIfStatus(order, order.status, { payment: { ...order.payment, verifiedAt: nowIso() } });
}

/** Actor recorded on timeline events written by the Odoo status sync. */
export const ODOO_ACTOR: OrderActor = { id: null, name: 'Odoo' };

/**
 * Moves an order to the next status in the flow. `sessionId` null = admin (any dealer).
 * `expected` (when given) must match the current status, otherwise nothing changes.
 * `actor` is recorded on the timeline event.
 */
export async function advanceOrder(sessionId: string | null, id: string, trackingRef?: string, expected?: OrderStatus, actor?: OrderActor): Promise<ProtoOrder | undefined> {
  const order = await getOrder(sessionId, id);
  if (!order || order.status === 'CANCELLED' || (expected && order.status !== expected)) return order;
  const next: OrderStatus | undefined = ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(order.status) + 1];
  if (!next) return order;
  const change: Record<string, unknown> = { status: next, events: [...order.events, { status: next, at: nowIso(), ...(actor ? { by: actor } : {}) }] };
  if (next === 'SHIPPED') change.trackingRef = trackingRef?.trim() || null;
  return updateIfStatus(order, order.status, change);
}

/**
 * Moves the order to the status Odoo implies (forward only, or to CANCELLED before payment) and
 * stores the latest delivery/invoice progress. Skipped steps get a timeline event each.
 * Returns the updated order, or the unchanged one when Odoo implies nothing new.
 */
export async function applyOdooProgress(order: ProtoOrder, target: OrderStatus, progress: NonNullable<OdooSync['progress']>): Promise<ProtoOrder> {
  if (!order.odoo) return order;
  const odoo: OdooSync = { ...order.odoo, progress };
  const at = nowIso();
  const from = ORDER_STATUS_FLOW.indexOf(order.status);
  const to = ORDER_STATUS_FLOW.indexOf(target);
  let change: Record<string, unknown> = { odoo };
  if (target === 'CANCELLED' && order.status !== 'CANCELLED' && order.status !== 'PAID') {
    change = { ...change, status: 'CANCELLED', events: [...order.events, { status: 'CANCELLED', at, by: ODOO_ACTOR }] };
  } else if (from >= 0 && to > from) {
    const steps = ORDER_STATUS_FLOW.slice(from + 1, to + 1).map((status) => ({ status, at, by: ODOO_ACTOR }));
    change = { ...change, status: target, events: [...order.events, ...steps] };
  }
  return updateIfStatus(order, order.status, change);
}

/** Sets or clears the parcel tracking number (Odoo has no carrier tracking field without `stock_delivery`). */
export async function setTrackingRef(id: string, trackingRef: string): Promise<ProtoOrder | undefined> {
  const row = unwrap(await db().from('ShopOrder').update({ trackingRef: trackingRef.trim().slice(0, 60) || null, updatedAt: nowIso() }).eq('id', id).select('*').maybeSingle()) as OrderRow | null;
  return row ? toOrder(row) : undefined;
}

/** Records the latest Odoo push result on an order. */
export async function setOdooSync(id: string, sync: OdooSync): Promise<ProtoOrder | undefined> {
  const row = unwrap(await db().from('ShopOrder').update({ odoo: sync, updatedAt: nowIso() }).eq('id', id).select('*').maybeSingle()) as OrderRow | null;
  return row ? toOrder(row) : undefined;
}

/** Cancels a pending order. `sessionId` null = admin; admin may also cancel while preparing. */
export async function cancelOrder(sessionId: string | null, id: string, actor?: OrderActor): Promise<ProtoOrder | undefined> {
  const order = await getOrder(sessionId, id);
  const cancellable: OrderStatus[] = sessionId === null ? ['PENDING', 'PREPARING'] : ['PENDING'];
  if (!order || !cancellable.includes(order.status)) return order;
  return updateIfStatus(order, order.status, { status: 'CANCELLED', events: [...order.events, { status: 'CANCELLED', at: nowIso(), ...(actor ? { by: actor } : {}) }] });
}

/** Stores the outcome of cancelling the SO in Odoo on the order's sync record. */
export async function setOdooCancel(id: string, cancel: NonNullable<OdooSync['cancel']>): Promise<ProtoOrder | undefined> {
  const order = await getOrder(null, id);
  if (!order?.odoo) return order;
  return setOdooSync(id, { ...order.odoo, cancel });
}
