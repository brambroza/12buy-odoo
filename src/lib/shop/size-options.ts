import type { DealerType, ParsedSize } from './types';

/** One selectable size broken into the parts dealers pick from dropdowns. */
export type SizeOption = {
  /** Canonical label, e.g. `195/65R15`. */
  label: string;
  /** Section width, e.g. `195`, `11`, `33`. */
  width: string;
  /** Aspect ratio / series, or null for sizes like `11R22.5`. */
  aspect: string | null;
  /** Rim diameter in inches, e.g. `15`, `22.5`. */
  rim: string;
  types: DealerType[];
};

const PARTS = /^(\d+(?:\.\d+)?)(?:[/xX](\d+(?:\.\d+)?))?(?:ZR|R|-)(\d+(?:\.\d+)?)C?$/i;

/** Splits a size label into width / aspect / rim; null when the label is not a tyre size. */
export function splitSize(label: string): Pick<SizeOption, 'width' | 'aspect' | 'rim'> | null {
  const m = label.match(PARTS);
  if (!m) return null;
  return { width: m[1], aspect: m[2] ?? null, rim: m[3] };
}

const num = (v: string | null) => (v === null ? -1 : Number(v));

/** Distinct sizes in the catalog, sorted by width → aspect → rim, with the families each size appears in. */
export function buildSizeOptions(products: readonly { size: ParsedSize | null; dealerType: DealerType }[]): SizeOption[] {
  const byLabel = new Map<string, SizeOption>();
  for (const p of products) {
    if (!p.size) continue;
    const parts = splitSize(p.size.label);
    if (!parts) continue;
    const existing = byLabel.get(p.size.label);
    if (existing) {
      if (!existing.types.includes(p.dealerType)) existing.types.push(p.dealerType);
    } else {
      byLabel.set(p.size.label, { label: p.size.label, ...parts, types: [p.dealerType] });
    }
  }
  return [...byLabel.values()].sort((a, b) => num(a.width) - num(b.width) || num(a.aspect) - num(b.aspect) || num(a.rim) - num(b.rim));
}

/** Unique values of one part, in catalog order, after narrowing by the already-chosen parts and family. */
export function partValues(
  options: readonly SizeOption[],
  part: 'width' | 'aspect' | 'rim',
  chosen: { type?: DealerType; width?: string; aspect?: string | null },
): (string | null)[] {
  const seen = new Set<string | null>();
  const out: (string | null)[] = [];
  for (const o of options) {
    if (chosen.type && !o.types.includes(chosen.type)) continue;
    if (chosen.width !== undefined && o.width !== chosen.width) continue;
    if (chosen.aspect !== undefined && o.aspect !== chosen.aspect) continue;
    const v = o[part];
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

/**
 * Query string for the public search given whatever parts are chosen.
 * Full selection → exact label; partial → digit prefix that `normalizeSizeQuery` matches by prefix.
 */
export function sizeQuery(chosen: { width?: string; aspect?: string | null; rim?: string }, options: readonly SizeOption[]): string {
  if (!chosen.width) return '';
  if (chosen.rim) {
    const exact = options.find((o) => o.width === chosen.width && (chosen.aspect === undefined || o.aspect === chosen.aspect) && o.rim === chosen.rim);
    if (exact) return exact.label;
  }
  const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
  return `${digits(chosen.width)}${digits(chosen.aspect)}${digits(chosen.rim)}`;
}
