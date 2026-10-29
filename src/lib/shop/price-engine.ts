/**
 * Re-implements the subset of Odoo's pricelist rule evaluation that this
 * database uses (fixed per product, percentage per category, formula, and
 * "based on another pricelist"). Used to show prices on the catalog without a
 * round-trip to Odoo. Prices are read from Odoo; nothing is written back.
 */

export type PricelistItem = {
  id: number;
  pricelistId: number;
  appliedOn: '3_global' | '2_product_category' | '1_product' | '0_product_variant';
  productTmplId: number | null;
  productId: number | null;
  categId: number | null;
  minQuantity: number;
  computePrice: 'fixed' | 'percentage' | 'formula';
  fixedPrice: number;
  percentPrice: number;
  priceDiscount: number;
  priceSurcharge: number;
  priceRound: number;
  priceMinMargin: number;
  priceMaxMargin: number;
  base: 'list_price' | 'standard_price' | 'pricelist';
  basePricelistId: number | null;
  dateStart: string | null;
  dateEnd: string | null;
};

export type PriceContext = {
  itemsByPricelist: Map<number, PricelistItem[]>;
  /** category id -> parent category id (null for roots) */
  categoryParents: Map<number, number | null>;
  now?: Date;
};

export type PriceSubject = {
  productId: number;
  tmplId: number;
  categoryId: number;
  listPrice: number;
};

/** Returns the category id plus all ancestors, nearest first. */
export function categoryChain(categoryId: number, parents: Map<number, number | null>): number[] {
  const chain: number[] = [];
  let current: number | null | undefined = categoryId;
  let guard = 0;
  while (current && guard++ < 20) {
    chain.push(current);
    current = parents.get(current) ?? null;
  }
  return chain;
}

/** Odoo evaluates items ordered by applied_on, min_quantity desc, categ_id desc, id desc. */
export function sortItems(items: PricelistItem[]): PricelistItem[] {
  return [...items].sort((a, b) =>
    a.appliedOn.localeCompare(b.appliedOn) ||
    b.minQuantity - a.minQuantity ||
    (b.categId ?? 0) - (a.categId ?? 0) ||
    b.id - a.id,
  );
}

function isApplicable(item: PricelistItem, subject: PriceSubject, qty: number, chain: number[], now: Date): boolean {
  if (item.minQuantity && qty < item.minQuantity) return false;
  if (item.dateStart && new Date(item.dateStart) > now) return false;
  if (item.dateEnd && new Date(item.dateEnd) < now) return false;
  switch (item.appliedOn) {
    case '0_product_variant': return item.productId === subject.productId;
    case '1_product': return item.productTmplId === subject.tmplId;
    case '2_product_category': return item.categId !== null && chain.includes(item.categId);
    case '3_global': return true;
  }
}

function roundTo(value: number, step: number): number {
  if (!step) return value;
  return Math.round(value / step) * step;
}

/**
 * Computes the unit price of a product for a pricelist and quantity.
 * Falls back to the product list price when no rule matches.
 */
export function computePrice(subject: PriceSubject, pricelistId: number, qty: number, ctx: PriceContext, depth = 0): number {
  if (depth > 5) return subject.listPrice;
  const now = ctx.now ?? new Date();
  const chain = categoryChain(subject.categoryId, ctx.categoryParents);
  const items = sortItems(ctx.itemsByPricelist.get(pricelistId) ?? []);
  const rule = items.find((item) => isApplicable(item, subject, qty, chain, now));
  if (!rule) return subject.listPrice;

  const basePrice = rule.base === 'pricelist' && rule.basePricelistId
    ? computePrice(subject, rule.basePricelistId, qty, ctx, depth + 1)
    : subject.listPrice;

  if (rule.computePrice === 'fixed') return rule.fixedPrice;
  if (rule.computePrice === 'percentage') return round2(basePrice * (1 - rule.percentPrice / 100));

  let price = basePrice * (1 - rule.priceDiscount / 100);
  price = roundTo(price, rule.priceRound) + rule.priceSurcharge;
  if (rule.priceMinMargin) price = Math.max(price, basePrice + rule.priceMinMargin);
  if (rule.priceMaxMargin) price = Math.min(price, basePrice + rule.priceMaxMargin);
  return round2(price);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Maps a raw `product.pricelist.item` record from Odoo into the engine shape. */
export function fromOdooItem(raw: Record<string, unknown>): PricelistItem {
  const rel = (value: unknown): number | null => (Array.isArray(value) ? (value[0] as number) : null);
  const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
  const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
  return {
    id: raw.id as number,
    pricelistId: rel(raw.pricelist_id) ?? 0,
    appliedOn: raw.applied_on as PricelistItem['appliedOn'],
    productTmplId: rel(raw.product_tmpl_id),
    productId: rel(raw.product_id),
    categId: rel(raw.categ_id),
    minQuantity: num(raw.min_quantity),
    computePrice: raw.compute_price as PricelistItem['computePrice'],
    fixedPrice: num(raw.fixed_price),
    percentPrice: num(raw.percent_price),
    priceDiscount: num(raw.price_discount),
    priceSurcharge: num(raw.price_surcharge),
    priceRound: num(raw.price_round),
    priceMinMargin: num(raw.price_min_margin),
    priceMaxMargin: num(raw.price_max_margin),
    base: (raw.base as PricelistItem['base']) ?? 'list_price',
    basePricelistId: rel(raw.base_pricelist_id),
    dateStart: str(raw.date_start),
    dateEnd: str(raw.date_end),
  };
}
