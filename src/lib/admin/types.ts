import type { DealerTier, DealerType } from '@/lib/shop/types';

/** Group of provinces that share one price table. */
export type PriceZone = {
  id: string;
  name: string;
  provinces: string[];
  isDefault: boolean;
};

/** One price table = one (zone × tier) cell. Becomes one Odoo pricelist when published. */
export type PriceBook = {
  id: string;
  zoneId: string;
  tier: DealerTier;
  /** Odoo pricelist used as the starting point / fallback for products without an entry. */
  basePricelistId: number;
  /** Fixed unit price per product template id. */
  entries: Record<string, number>;
  /** Percent adjustment per dealer type applied on top of the base pricelist price (+ = more expensive). */
  typePercent: Partial<Record<DealerType, number>>;
  /** DRAFT → PENDING_APPROVAL (submitted) → PUBLISHED (approved by a different person). Any edit returns to DRAFT. */
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED';
  submittedBy: string | null;
  approvedBy: string | null;
  updatedAt: string;
  publishedAt: string | null;
  lastDryRun: DryRunResult | null;
  /** Odoo pricelist this book was written to; reused on every later publish. */
  odooPricelistId?: number | null;
  /** Outcome of the last attempt to write this book into Odoo. */
  odooPublish?: OdooPublishResult | null;
};

/** SKIPPED = published on the web only because Odoo writes are off (`ODOO_READ_ONLY`). */
export type OdooPublishResult = {
  status: 'DONE' | 'SKIPPED' | 'FAILED';
  pricelistId: number | null;
  created: number;
  updated: number;
  removed: number;
  error: string | null;
  at: string;
};

/**
 * Customer group: which products its dealers may see and order, on top of their product families.
 * Empty brands + categories + include list = every product of the dealer's families.
 * `excludeTmplIds` always wins.
 */
export type CustomerGroup = {
  id: string;
  name: string;
  /** Brand codes taken from the Odoo category prefix, e.g. `YK` for `YK-PCR`. */
  brands: string[];
  /** Odoo product category ids. */
  categoryIds: number[];
  /** Product template ids that are always visible, even outside the brands/categories above. */
  includeTmplIds: number[];
  /** Product template ids that are never visible. */
  excludeTmplIds: number[];
  updatedAt: string;
};

/** What a publish would do in Odoo (never executed by the prototype). */
export type DryRunResult = {
  at: string;
  pricelistName: string;
  targetPricelistId: number | null;
  create: { tmplId: number; name: string; price: number }[];
  update: { tmplId: number; name: string; from: number; to: number }[];
  unlink: { tmplId: number; name: string; price: number }[];
  unchanged: number;
};

/** Pairs an Odoo credit pricelist with its cash counterpart (e.g. TBR Credit ↔ TBR Cash). */
export type CashPair = { creditPricelistId: number; cashPricelistId: number };

/** Admin assignment for an Odoo customer (partner). */
export type DealerAssignment = {
  odooPartnerId: number;
  types: DealerType[];
  tier: DealerTier;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  updatedAt: string;
};
