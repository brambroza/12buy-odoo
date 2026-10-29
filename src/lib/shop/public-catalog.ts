import { brandName } from '@/lib/landing-content';
import { getCatalog, searchProducts, type Catalog } from './catalog';
import { DEALER_TYPE_LABELS, type CatalogProduct, type DealerType, type ParsedSize } from './types';

/** Coarse stock signal safe to publish. Never expose raw quantities publicly. */
export type StockLevel = 'IN_STOCK' | 'LOW' | 'BACKORDER';

export const STOCK_LABELS: Record<StockLevel, string> = { IN_STOCK: 'มีของ', LOW: 'เหลือน้อย', BACKORDER: 'สั่งจอง' };

/** Product fields allowed on public (pre-login) pages. No prices, no quantities, no Odoo internals. */
export type PublicProduct = {
  id: number;
  name: string;
  brand: string;
  /** Display name resolved from the brand code. */
  brandName: string;
  dealerType: DealerType;
  typeLabel: string;
  size: ParsedSize | null;
  imageUrl: string | null;
  stock: StockLevel;
};

const ALL_TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

/** Buckets a quantity into the public stock signal (same thresholds as `StockBadge`). */
export function stockLevel(qty: number): StockLevel {
  return qty >= 8 ? 'IN_STOCK' : qty > 0 ? 'LOW' : 'BACKORDER';
}

/** Strips a catalog product down to the public shape. */
export function toPublicProduct(product: CatalogProduct): PublicProduct {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    brandName: brandName(product.brand),
    dealerType: product.dealerType,
    typeLabel: DEALER_TYPE_LABELS[product.dealerType],
    size: product.size,
    imageUrl: product.imageUrl,
    stock: stockLevel(product.qtyAvailable),
  };
}

export type PublicSearch = { query?: string; type?: DealerType; brand?: string };

/** Public search across every product family, sorted by brand then size. */
export function publicSearch(catalog: Catalog, options: PublicSearch): PublicProduct[] {
  return searchProducts(catalog, { query: options.query, types: ALL_TYPES, type: options.type, brand: options.brand })
    .map(toPublicProduct)
    .sort((a, b) => a.brand.localeCompare(b.brand) || (a.size?.label ?? '').localeCompare(b.size?.label ?? '') || a.name.localeCompare(b.name));
}

/** Distinct brand codes with display names and product counts, most products first. */
export function listBrands(catalog: Catalog, type?: DealerType): { brand: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of catalog.products) {
    if (type && p.dealerType !== type) continue;
    counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
  }
  return [...counts.entries()].map(([brand, count]) => ({ brand, name: brandName(brand), count })).sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}

/** Parses a `type` query param into a DealerType, or undefined. */
export function parseDealerType(raw: string | undefined): DealerType | undefined {
  return ALL_TYPES.includes(raw as DealerType) ? (raw as DealerType) : undefined;
}

/**
 * Loads the catalog for public pages. Returns null instead of throwing so a
 * pre-rendered marketing page still renders when Odoo is unreachable.
 */
export async function loadPublicCatalog(): Promise<Catalog | null> {
  try {
    return await getCatalog();
  } catch (error) {
    console.error('[public-catalog] load failed', error instanceof Error ? error.message : error);
    return null;
  }
}
