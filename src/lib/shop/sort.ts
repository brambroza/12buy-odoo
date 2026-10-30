import type { CatalogProduct } from './types';

export type SortKey = 'price' | 'price_desc' | 'brand' | 'stock' | 'size';
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'price', label: 'ราคาถูกก่อน' },
  { key: 'price_desc', label: 'ราคาแพงก่อน' },
  { key: 'brand', label: 'ยี่ห้อ ก-ฮ' },
  { key: 'size', label: 'ขนาด' },
  { key: 'stock', label: 'สต็อกมากก่อน' },
];

export function parseSort(raw: string | undefined): SortKey {
  return SORT_OPTIONS.some((o) => o.key === raw) ? (raw as SortKey) : 'price';
}

type Priced = { product: CatalogProduct; price: number };

/** Sorts priced products; ties always fall back to size label so lists are stable. */
export function sortPriced(items: Priced[], sort: SortKey): Priced[] {
  const size = (a: Priced, b: Priced) => (a.product.size?.label ?? '').localeCompare(b.product.size?.label ?? '');
  const by: Record<SortKey, (a: Priced, b: Priced) => number> = {
    price: (a, b) => a.price - b.price || size(a, b),
    price_desc: (a, b) => b.price - a.price || size(a, b),
    brand: (a, b) => a.product.brand.localeCompare(b.product.brand) || a.price - b.price,
    size: (a, b) => size(a, b) || a.price - b.price,
    stock: (a, b) => b.product.qtyAvailable - a.product.qtyAvailable || a.price - b.price,
  };
  return [...items].sort(by[sort]);
}

/** Parses `?min=`/`?max=` baht bounds (blank or invalid = no bound). */
export function parsePriceRange(min: string | undefined, max: string | undefined): { min: number | null; max: number | null } {
  const num = (v: string | undefined) => { const n = Number(String(v ?? '').replace(/,/g, '')); return v && Number.isFinite(n) && n >= 0 ? n : null; };
  return { min: num(min), max: num(max) };
}
