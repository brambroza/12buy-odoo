/**
 * Writes an approved web price book into its own Odoo pricelist, so a sale order that
 * Odoo recomputes (quantity edited, line added in Odoo) still gets the web price.
 *
 * The book's pricelist is owned by the web: every publish makes its items match the book
 * (fixed price per product, % per category from the base pricelist, fallback to the base
 * pricelist) and removes anything else. Existing Odoo pricelists are never written.
 */
import type { OdooPublishResult, PriceBook, PriceZone } from '@/lib/admin/types';
import { pricelistNameFor } from '@/lib/admin/dry-run';
import { fromOdooItem, type PricelistItem } from '@/lib/shop/price-engine';
import type { CatalogProduct } from '@/lib/shop/types';
import { odooSearchRead, odooWrite, odooWritesEnabled } from './rpc';

/** Values of one `product.pricelist.item`, keyed so the same rule is matched across publishes. */
export type DesiredItem = { key: string; values: Record<string, unknown> };

export type SyncPlan = { create: Record<string, unknown>[]; update: { id: number; values: Record<string, unknown> }[]; unlink: number[] };

const ITEM_FIELDS = ['pricelist_id', 'applied_on', 'product_tmpl_id', 'product_id', 'categ_id', 'min_quantity', 'compute_price', 'fixed_price', 'percent_price',
  'price_discount', 'price_surcharge', 'price_round', 'price_min_margin', 'price_max_margin', 'base', 'base_pricelist_id', 'date_start', 'date_end'];

const formula = (basePricelistId: number, percent: number) => ({
  compute_price: 'formula', base: 'pricelist', base_pricelist_id: basePricelistId,
  // Odoo's discount is the opposite sign of the book's adjustment (+10% = discount −10).
  price_discount: percent ? -percent : 0, price_surcharge: 0, price_round: 0, price_min_margin: 0, price_max_margin: 0,
});

/**
 * Items the book's pricelist must hold: one fixed item per entry, one formula item per
 * category whose product family has a % adjustment, and a global fallback to the base pricelist.
 * Mirrors `priceFromBook`: entry → base × (1 + %) → base.
 */
export function desiredItems(book: Pick<PriceBook, 'entries' | 'typePercent' | 'basePricelistId'>, products: Pick<CatalogProduct, 'categoryId' | 'dealerType'>[]): DesiredItem[] {
  const items: DesiredItem[] = Object.entries(book.entries).map(([tmplId, price]) => ({
    key: `p:${tmplId}`,
    values: { applied_on: '1_product', product_tmpl_id: Number(tmplId), compute_price: 'fixed', fixed_price: price, min_quantity: 0 },
  }));
  const categories = new Map<number, number>();
  for (const product of products) {
    const percent = book.typePercent[product.dealerType] ?? 0;
    if (percent) categories.set(product.categoryId, percent);
  }
  for (const [categId, percent] of [...categories].sort((a, b) => a[0] - b[0])) {
    items.push({ key: `c:${categId}`, values: { applied_on: '2_product_category', categ_id: categId, min_quantity: 0, ...formula(book.basePricelistId, percent) } });
  }
  items.push({ key: 'g', values: { applied_on: '3_global', min_quantity: 0, ...formula(book.basePricelistId, 0) } });
  return items;
}

/** Key of an existing item, or null for items the web did not make (they are removed). */
function existingKey(item: PricelistItem): string | null {
  if (item.minQuantity || item.dateStart || item.dateEnd) return null;
  if (item.appliedOn === '1_product' && item.computePrice === 'fixed' && item.productTmplId) return `p:${item.productTmplId}`;
  if (item.appliedOn === '2_product_category' && item.computePrice === 'formula' && item.categId) return `c:${item.categId}`;
  if (item.appliedOn === '3_global' && item.computePrice === 'formula') return 'g';
  return null;
}

/** Whether an existing item already has these values. */
function sameItem(item: PricelistItem, values: Record<string, unknown>): boolean {
  const near = (a: number, b: unknown) => Math.abs(a - Number(b ?? 0)) < 0.005;
  if (values.compute_price === 'fixed') return near(item.fixedPrice, values.fixed_price);
  return item.base === 'pricelist' && item.basePricelistId === values.base_pricelist_id && near(item.priceDiscount, values.price_discount)
    && near(item.priceSurcharge, 0) && near(item.priceRound, 0) && near(item.priceMinMargin, 0) && near(item.priceMaxMargin, 0);
}

/** Creates, updates and removals that turn `existing` into `desired`. Duplicates of a key are removed. */
export function planSync(desired: DesiredItem[], existing: PricelistItem[]): SyncPlan {
  const byKey = new Map<string, PricelistItem>();
  const plan: SyncPlan = { create: [], update: [], unlink: [] };
  for (const item of [...existing].sort((a, b) => a.id - b.id)) {
    const key = existingKey(item);
    if (!key || byKey.has(key)) plan.unlink.push(item.id);
    else byKey.set(key, item);
  }
  const wanted = new Set(desired.map((d) => d.key));
  for (const [key, item] of byKey) if (!wanted.has(key)) plan.unlink.push(item.id);
  for (const { key, values } of desired) {
    const item = byKey.get(key);
    if (!item) plan.create.push(values);
    else if (!sameItem(item, values)) plan.update.push({ id: item.id, values });
  }
  return plan;
}

const result = (status: OdooPublishResult['status'], pricelistId: number | null, plan: SyncPlan | null, error: string | null): OdooPublishResult => ({
  status, pricelistId, created: plan?.create.length ?? 0, updated: plan?.update.length ?? 0, removed: plan?.unlink.length ?? 0, error, at: new Date().toISOString(),
});

/**
 * Publishes a book to its Odoo pricelist (created on first publish). Never throws:
 * writes switched off → SKIPPED, Odoo errors → FAILED with the message.
 */
export async function publishBookToOdoo(book: PriceBook, zone: PriceZone, products: CatalogProduct[]): Promise<OdooPublishResult> {
  if (!odooWritesEnabled()) return result('SKIPPED', book.odooPricelistId ?? null, null, 'Odoo อยู่ในโหมดอ่านอย่างเดียว ราคาใช้บนเว็บแล้ว แต่ยังไม่ได้เขียน pricelist ลง Odoo');
  let pricelistId = book.odooPricelistId ?? null;
  try {
    if (pricelistId === book.basePricelistId) throw new Error('pricelist ของตารางต้องไม่ใช่ pricelist ฐานเดียวกัน');
    if (pricelistId) {
      const [found] = await odooSearchRead<{ id: number }>('product.pricelist', [['id', '=', pricelistId]], ['id'], { limit: 1 });
      if (!found) pricelistId = null;
    }
    if (!pricelistId) {
      const created = await odooWrite<number | number[]>('product.pricelist', 'create', [[{ name: pricelistNameFor(zone, book) }]]);
      pricelistId = Array.isArray(created) ? created[0] : created;
    }
    const raw = await odooSearchRead<Record<string, unknown>>('product.pricelist.item', [['pricelist_id', '=', pricelistId]], ITEM_FIELDS, { limit: 5000 });
    const plan = planSync(desiredItems(book, products), raw.map(fromOdooItem));
    if (plan.unlink.length) await odooWrite<boolean>('product.pricelist.item', 'unlink', [plan.unlink]);
    for (const { id, values } of plan.update) await odooWrite<boolean>('product.pricelist.item', 'write', [[id], values]);
    if (plan.create.length) await odooWrite<number[]>('product.pricelist.item', 'create', [plan.create.map((values) => ({ ...values, pricelist_id: pricelistId }))]);
    return result('DONE', pricelistId, plan, null);
  } catch (error) {
    return result('FAILED', pricelistId, null, error instanceof Error ? error.message : String(error));
  }
}
