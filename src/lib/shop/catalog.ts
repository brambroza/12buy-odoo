import { odooSearchRead } from '@/lib/odoo/rpc';
import { computePrice, fromOdooItem, type PriceContext, type PricelistItem } from './price-engine';
import { normalizeSizeQuery, parseSize, sizeMatches } from './size';
import { baseUnitLabel, buildUnitIndex, unitsForProduct, type RawUom } from './units';
import type { CatalogProduct, DealerType } from './types';
import { isProductVisible, type VisibilityScope } from './visibility';

type RawProduct = {
  id: number;
  product_tmpl_id: [number, string];
  name: string;
  default_code: string | false;
  list_price: number;
  categ_id: [number, string] | false;
  qty_available: number;
  is_published: boolean;
  uom_id: [number, string] | false;
  uom_ids: number[] | false;
  taxes_id: number[];
};

type RawTax = { id: number; amount: number; amount_type: string; price_include: boolean };

type RawCategory = { id: number; name: string; parent_id: [number, string] | false };
type RawPricelist = { id: number; name: string };
export type Carrier = { id: number; name: string };
export type Province = { id: number; name: string; code: string };

export type Catalog = {
  products: CatalogProduct[];
  pricelists: RawPricelist[];
  priceCtx: PriceContext;
  loadedAt: Date;
};

const CATALOG_TTL_MS = 5 * 60 * 1000;
const SUFFIX_TO_TYPE: Record<string, DealerType> = { PCR: 'CAR', TBR: 'TRUCK', MC: 'MOTORCYCLE', BT: 'BATTERY', WH: 'WHEEL' };

let catalogCache: { value: Catalog; expiresAt: number } | null = null;
let catalogInFlight: Promise<Catalog> | null = null;
let referenceCache: { carriers: Carrier[]; provinces: Province[]; expiresAt: number } | null = null;
let referenceInFlight: Promise<{ carriers: Carrier[]; provinces: Province[] }> | null = null;

/** Splits an Odoo category name like `YK-PCR` into brand code and dealer type. */
export function classifyCategory(categoryName: string): { brand: string; dealerType: DealerType } | null {
  const [brand, suffix] = categoryName.toUpperCase().split('-');
  const dealerType = suffix ? SUFFIX_TO_TYPE[suffix] : undefined;
  return dealerType ? { brand, dealerType } : null;
}

/**
 * Sales VAT of a product from its Odoo taxes: positive percent taxes add up to the rate
 * (withholding taxes are negative and ignored). Prices count as VAT-included only when
 * every such tax is price-included, as Odoo then adds nothing on top.
 */
export function vatFromTaxes(taxIds: number[], taxes: Map<number, RawTax>): { vatRate: number; vatIncluded: boolean } {
  const vat = taxIds.map((id) => taxes.get(id)).filter((t): t is RawTax => Boolean(t && t.amount_type === 'percent' && t.amount > 0));
  if (!vat.length) return { vatRate: 0, vatIncluded: true };
  return { vatRate: vat.reduce((sum, t) => sum + t.amount, 0), vatIncluded: vat.every((t) => t.price_include) };
}

/** Builds a public image URL for published products (Odoo serves these without login). */
function imageUrlFor(tmplId: number, published: boolean): string | null {
  const base = process.env.ODOO_URL;
  return published && base ? `${base}/web/image/product.template/${tmplId}/image_512` : null;
}

/** Loads products, categories and pricelist rules from Odoo (read-only) with a 5-minute cache. */
export async function getCatalog(): Promise<Catalog> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;
  if (!catalogInFlight) {
    catalogInFlight = loadCatalog().finally(() => { catalogInFlight = null; });
  }
  return catalogInFlight;
}

/** Performs the actual Odoo reads for the catalog (single-flight via getCatalog). */
async function loadCatalog(): Promise<Catalog> {
  const [rawProducts, rawCategories, rawPricelists, rawItems, rawUoms, rawTaxes] = await Promise.all([
    odooSearchRead<RawProduct>('product.product', [['sale_ok', '=', true], ['categ_id', '!=', false]],
      ['id', 'product_tmpl_id', 'name', 'default_code', 'list_price', 'categ_id', 'qty_available', 'is_published', 'uom_id', 'uom_ids', 'taxes_id'], { limit: 2000, order: 'default_code asc' }),
    odooSearchRead<RawCategory>('product.category', [], ['id', 'name', 'parent_id'], { limit: 500 }),
    odooSearchRead<RawPricelist>('product.pricelist', [], ['id', 'name'], { limit: 200 }),
    odooSearchRead<Record<string, unknown>>('product.pricelist.item', [],
      ['pricelist_id', 'applied_on', 'product_tmpl_id', 'product_id', 'categ_id', 'min_quantity', 'compute_price', 'fixed_price', 'percent_price',
        'price_discount', 'price_surcharge', 'price_round', 'price_min_margin', 'price_max_margin', 'base', 'base_pricelist_id', 'date_start', 'date_end'], { limit: 5000 }),
    odooSearchRead<RawUom>('uom.uom', [], ['id', 'name', 'relative_factor', 'relative_uom_id'], { limit: 500 }).catch(() => [] as RawUom[]),
    odooSearchRead<RawTax>('account.tax', [['type_tax_use', '=', 'sale']], ['id', 'amount', 'amount_type', 'price_include'], { limit: 200 }),
  ]);
  const taxIndex = new Map(rawTaxes.map((t) => [t.id, t]));
  const unitIndex = buildUnitIndex(rawUoms);

  const categoryParents = new Map<number, number | null>(rawCategories.map((c) => [c.id, c.parent_id ? c.parent_id[0] : null]));
  const itemsByPricelist = new Map<number, PricelistItem[]>();
  for (const raw of rawItems) {
    const item = fromOdooItem(raw);
    itemsByPricelist.set(item.pricelistId, [...(itemsByPricelist.get(item.pricelistId) ?? []), item]);
  }

  const products: CatalogProduct[] = [];
  for (const raw of rawProducts) {
    if (!raw.categ_id) continue;
    const classified = classifyCategory(raw.categ_id[1]);
    if (!classified) continue;
    products.push({
      id: raw.id,
      tmplId: raw.product_tmpl_id[0],
      name: raw.name,
      code: raw.default_code || '',
      listPrice: raw.list_price,
      categoryId: raw.categ_id[0],
      categoryName: raw.categ_id[1],
      brand: classified.brand,
      dealerType: classified.dealerType,
      size: parseSize(raw.name),
      qtyAvailable: raw.qty_available,
      imageUrl: imageUrlFor(raw.product_tmpl_id[0], raw.is_published),
      baseUnit: baseUnitLabel(classified.dealerType),
      units: unitsForProduct(classified.dealerType, raw.uom_id ? raw.uom_id[0] : 0, raw.uom_ids || [], unitIndex),
      ...vatFromTaxes(raw.taxes_id ?? [], taxIndex),
    });
  }

  const value: Catalog = { products, pricelists: rawPricelists, priceCtx: { itemsByPricelist, categoryParents }, loadedAt: new Date() };
  catalogCache = { value, expiresAt: Date.now() + CATALOG_TTL_MS };
  return value;
}

/** Drops the cached catalog so the next read reloads products and pricelists from Odoo (after a publish). */
export function clearCatalogCache() {
  catalogCache = null;
}

/** Loads Thai provinces and delivery carriers (read-only, cached 1 hour). */
export async function getReferenceData(): Promise<{ carriers: Carrier[]; provinces: Province[] }> {
  if (referenceCache && referenceCache.expiresAt > Date.now()) return referenceCache;
  if (!referenceInFlight) {
    referenceInFlight = loadReferenceData().finally(() => { referenceInFlight = null; });
  }
  return referenceInFlight;
}

async function loadReferenceData(): Promise<{ carriers: Carrier[]; provinces: Province[] }> {
  const [carriers, provinces] = await Promise.all([
    odooSearchRead<Carrier>('delivery.carrier', [], ['id', 'name'], { limit: 300, order: 'id asc' }),
    odooSearchRead<Province>('res.country.state', [['country_id.code', '=', 'TH']], ['id', 'name', 'code'], { limit: 100, order: 'code asc' }),
  ]);
  referenceCache = { carriers, provinces, expiresAt: Date.now() + 60 * 60 * 1000 };
  return referenceCache;
}

/** Unit price for a product under the dealer's pricelist. */
export function priceFor(catalog: Catalog, product: CatalogProduct, pricelistId: number, qty = 1): number {
  return computePrice({ productId: product.id, tmplId: product.tmplId, categoryId: product.categoryId, listPrice: product.listPrice }, pricelistId, qty, catalog.priceCtx);
}

export function findProduct(catalog: Catalog, id: number): CatalogProduct | undefined {
  return catalog.products.find((p) => p.id === id);
}

export type SearchOptions = { query?: string; types: readonly DealerType[]; type?: DealerType; brand?: string; group?: VisibilityScope['group'] };

/**
 * Searches the catalog restricted to the dealer's allowed types and customer group.
 * Size-like queries match on parsed size; other text matches name/code/brand.
 */
export function searchProducts(catalog: Catalog, options: SearchOptions): CatalogProduct[] {
  const allowed = new Set(options.type ? [options.type] : options.types);
  const scope: VisibilityScope = { types: options.types, group: options.group ?? null };
  const normalized = options.query ? normalizeSizeQuery(options.query) : null;
  const text = options.query?.trim().toUpperCase() ?? '';
  return catalog.products.filter((product) => {
    if (!allowed.has(product.dealerType) || !isProductVisible(product, scope)) return false;
    if (options.brand && product.brand !== options.brand.toUpperCase()) return false;
    if (!normalized) return true;
    if (sizeMatches(product.size, normalized)) return true;
    if ('text' in normalized) return `${product.name} ${product.code} ${product.brand}`.toUpperCase().includes(text);
    return false;
  });
}

/** Formats a number as Thai Baht with two decimals. */
export function baht(value: number): string {
  const fraction = Number.isInteger(value) ? 0 : 2;
  return `฿${value.toLocaleString('th-TH', { minimumFractionDigits: fraction, maximumFractionDigits: fraction })}`;
}

/** Suggested default order quantity per product family. */
export function defaultQty(type: DealerType): number {
  return { CAR: 4, TRUCK: 2, MOTORCYCLE: 2, BATTERY: 1, WHEEL: 1 }[type];
}

export type Partner = {
  id: number;
  name: string;
  state_id: [number, string] | false;
  property_product_pricelist: [number, string] | false;
  street: string | false;
  city: string | false;
  zip: string | false;
  phone: string | false;
  /** Salesperson (res.users) responsible for this customer; drives commission on its sale orders. */
  user_id: [number, string] | false;
};

let partnerCache: { value: Partner[]; expiresAt: number } | null = null;

/** Odoo customers (read-only, cached 2 minutes) for the admin dealer list. */
export async function getPartners(): Promise<Partner[]> {
  if (partnerCache && partnerCache.expiresAt > Date.now()) return partnerCache.value;
  const value = await odooSearchRead<Partner>('res.partner', [['customer_rank', '>', 0]],
    ['id', 'name', 'state_id', 'property_product_pricelist', 'street', 'city', 'zip', 'phone', 'user_id'], { limit: 500, order: 'name asc' });
  partnerCache = { value, expiresAt: Date.now() + 2 * 60 * 1000 };
  return value;
}

/** One Odoo customer: from the cached list when present, else read directly (the list stops at 500). */
export async function getPartner(id: number): Promise<Partner | null> {
  const listed = (await getPartners()).find((p) => p.id === id);
  if (listed) return listed;
  const [row] = await odooSearchRead<Partner>('res.partner', [['id', '=', id]],
    ['id', 'name', 'state_id', 'property_product_pricelist', 'street', 'city', 'zip', 'phone', 'user_id'], { limit: 1 });
  return row ?? null;
}

/** Credit position of one Odoo customer; `limit` null means Odoo enforces no limit for this partner. */
export type PartnerCredit = { limit: number | null; used: number };

/**
 * Live credit limit and receivable balance for a partner (not cached: it changes with every invoice/payment).
 * Odoo only enforces `credit_limit` when it is above 0.
 */
export async function getPartnerCredit(partnerId: number): Promise<PartnerCredit | null> {
  const [row] = await odooSearchRead<{ credit: number; credit_limit: number }>('res.partner', [['id', '=', partnerId]], ['credit', 'credit_limit'], { limit: 1 });
  if (!row) return null;
  return { limit: row.credit_limit > 0 ? row.credit_limit : null, used: Math.max(0, Number(row.credit) || 0) };
}

/** Drops the cached partner list, e.g. after the web creates a partner. */
export function clearPartnerCache() {
  partnerCache = null;
}

/** Full province name as Odoo stores it (`จังหวัดเชียงใหม่`) → short (`เชียงใหม่`). */
export function shortProvince(name: string): string {
  return name.replace(/^จังหวัด/, '').replace(/\s*\(TH\)$/, '');
}
