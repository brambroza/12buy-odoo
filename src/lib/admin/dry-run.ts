import type { PricelistItem } from '@/lib/shop/price-engine';
import type { DryRunResult, PriceBook, PriceZone } from './types';
import { DEALER_TIER_LABELS } from '@/lib/shop/types';

/** Name the Odoo pricelist a book would be published as. */
export function pricelistNameFor(zone: PriceZone, book: PriceBook): string {
  return `WEB | ${zone.name} | ${book.tier} ${DEALER_TIER_LABELS[book.tier]}`;
}

/**
 * Computes what publishing a book would create/update/unlink on an Odoo pricelist,
 * comparing the book's fixed entries with existing `1_product` fixed items.
 * Pure function: nothing is sent to Odoo.
 */
export function dryRunPublish(
  book: PriceBook,
  zone: PriceZone,
  target: { pricelistId: number | null; items: PricelistItem[] },
  productNames: Map<number, string>,
): DryRunResult {
  const existing = new Map<number, number>();
  for (const item of target.items) {
    if (item.appliedOn === '1_product' && item.computePrice === 'fixed' && item.productTmplId) existing.set(item.productTmplId, item.fixedPrice);
  }
  const result: DryRunResult = { at: new Date().toISOString(), pricelistName: pricelistNameFor(zone, book), targetPricelistId: target.pricelistId, create: [], update: [], unlink: [], unchanged: 0 };
  const name = (tmplId: number) => productNames.get(tmplId) ?? `#${tmplId}`;

  for (const [key, price] of Object.entries(book.entries)) {
    const tmplId = Number(key);
    const current = existing.get(tmplId);
    if (current === undefined) result.create.push({ tmplId, name: name(tmplId), price });
    else if (Math.abs(current - price) > 0.004) result.update.push({ tmplId, name: name(tmplId), from: current, to: price });
    else result.unchanged += 1;
    existing.delete(tmplId);
  }
  for (const [tmplId, price] of existing) result.unlink.push({ tmplId, name: name(tmplId), price });
  return result;
}
