/**
 * Odoo product category names, read in either layout the client has used:
 * - flat, brand then family code: `YK-PCR`, `GS-BT`, `TM-WH` (optionally under parents: `All / YK-PCR`);
 * - nested since 2026-11-20, family parent then brand child: `PCR / YK`, `Battery / GS`, `Wheel / TM`.
 * Both are turned into the flat form so the shop, commission rates and reports keep one key per category.
 */

/** Parent category names (upper case) → family code used in the flat form. */
const FAMILY_ALIASES: Record<string, string> = {
  PCR: 'PCR',
  TBR: 'TBR',
  MC: 'MC',
  BT: 'BT',
  BATTERY: 'BT',
  WH: 'WH',
  WHEEL: 'WH',
};

/** Family code for a parent category name, or undefined when it is not a known product family. */
export function familyCodeOf(name: string): string | undefined {
  return FAMILY_ALIASES[name.trim().toUpperCase()];
}

/**
 * Flat `BRAND-FAMILY` key of an Odoo category name (its full path or display name).
 * `PCR / YK` → `YK-PCR`, `Battery / CM` → `CM-BT`, `All / Saleable / YK-PCR` → `YK-PCR`.
 * A leaf with no family (e.g. `OIL / PTT`, `Food`) is returned as the leaf name alone.
 */
export function canonicalCategory(name: string): string {
  const segments = name.split('/').map((s) => s.trim()).filter(Boolean);
  const leaf = segments.at(-1) ?? '';
  if (!leaf || leaf.includes('-')) return leaf;
  for (let i = segments.length - 2; i >= 0; i--) {
    const family = familyCodeOf(segments[i]);
    if (family) return `${leaf}-${family}`;
  }
  return leaf;
}
