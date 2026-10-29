import type { DealerType } from './types';

/** A unit the dealer can order in. `factor` = how many base units (เส้น/ลูก) one of these contains. */
export type SaleUnit = { id: number; name: string; factor: number };

/** Raw `uom.uom` row as read from Odoo 19 (packaging-style units are relative to another unit). */
export type RawUom = { id: number; name: string; relative_factor: number; relative_uom_id: [number, string] | false };

/** Thai label for the base unit of each product family. */
export function baseUnitLabel(type: DealerType): string {
  return type === 'BATTERY' ? 'ลูก' : type === 'WHEEL' ? 'วง' : 'เส้น';
}

/** Resolves every Odoo unit to an absolute factor against its root unit (e.g. มัด 3 เส้น → 3). */
export function buildUnitIndex(rows: readonly RawUom[]): Map<number, SaleUnit> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const index = new Map<number, SaleUnit>();
  for (const row of rows) {
    let factor = 1;
    let current: RawUom | undefined = row;
    let guard = 0;
    while (current && guard++ < 10) {
      factor *= Number(current.relative_factor) || 1;
      current = current.relative_uom_id ? byId.get(current.relative_uom_id[0]) : undefined;
    }
    index.set(row.id, { id: row.id, name: row.name, factor });
  }
  return index;
}

/**
 * Units offered for one product: the base unit first (renamed to the Thai label),
 * then any extra sale units from `uom_ids`, smallest pack first.
 */
export function unitsForProduct(type: DealerType, baseUomId: number, extraUomIds: readonly number[], index: Map<number, SaleUnit>): SaleUnit[] {
  const base: SaleUnit = { id: baseUomId, name: baseUnitLabel(type), factor: 1 };
  const extras = extraUomIds
    .map((id) => index.get(id))
    .filter((u): u is SaleUnit => Boolean(u) && u!.id !== baseUomId && u!.factor > 1)
    .sort((a, b) => a.factor - b.factor);
  return [base, ...extras];
}

/** Picks a unit by id, falling back to the base unit. */
export function pickUnit(units: readonly SaleUnit[], unitId: number | null | undefined): SaleUnit {
  return units.find((u) => u.id === unitId) ?? units[0];
}

/** Human description of a quantity, e.g. `2 มัด 3 เส้น (6 เส้น)` or `4 เส้น`. */
export function describeQty(baseQty: number, baseLabel: string, unit?: { name: string; factor: number } | null, unitQty?: number | null): string {
  if (!unit || unit.factor <= 1 || !unitQty) return `${baseQty} ${baseLabel}`;
  return `${unitQty} ${unit.name} (${baseQty} ${baseLabel})`;
}

/**
 * Parses the quantity part of a quick-order line.
 * `4` → 4 base units · `2มัด` / `2 มัด` → 2 packs (any pack) · `2มัด5` / `2 มัด 5` → 2 packs of 5.
 * Returns null when nothing quantity-like is present.
 */
export function parseQuickQty(text: string): { qty: number; pack: 'any' | number | null } | null {
  const t = text.trim();
  if (!t) return null;
  const pack = t.match(/^(\d{1,3})\s*(?:x\s*)?(?:มัด|แพ็ก|แพ็ค|pack)\s*(\d{1,3})?$/i);
  if (pack) return { qty: Number(pack[1]), pack: pack[2] ? Number(pack[2]) : 'any' };
  const plain = t.match(/^[xX*]?\s*(\d{1,3})$/);
  if (plain) return { qty: Number(plain[1]), pack: null };
  return null;
}
