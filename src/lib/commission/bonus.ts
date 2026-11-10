/**
 * Bonuses on top of commission: the sales-bonus ladder on collections ("เงินพิเศษ") and the fixed
 * amount per new customer. Pure, no I/O.
 */
import type { BonusSettings, BonusTier, NewCustomer } from './types';

/**
 * The client's "JFC SOLUTION 2569" sheet: collections from 2.3M in steps of 300k, with the salary of
 * each tier. The bonus column is the salary step-up from the tier before (15,000 below tier 1).
 */
export const JFC_2569_TIERS: BonusTier[] = [
  { minAmount: 2_300_000, bonus: 3_000, salary: 18_000 },
  { minAmount: 2_600_000, bonus: 4_000, salary: 22_000 },
  { minAmount: 2_900_000, bonus: 3_000, salary: 25_000 },
  { minAmount: 3_200_000, bonus: 3_000, salary: 28_000 },
  { minAmount: 3_500_000, bonus: 3_000, salary: 31_000 },
  { minAmount: 3_800_000, bonus: 3_000, salary: 34_000 },
  { minAmount: 4_100_000, bonus: 3_000, salary: 37_000 },
  { minAmount: 4_400_000, bonus: 3_000, salary: 40_000 },
  { minAmount: 4_700_000, bonus: 3_000, salary: 43_000 },
  { minAmount: 5_000_000, bonus: 4_000, salary: 47_000 },
];

/**
 * Tiers cleaned up: positive minimums, no negative bonus or salary, sorted, one tier per minimum
 * (the last wins). A blank or invalid salary is dropped from the tier.
 */
export function normalizeTiers(tiers: readonly Partial<BonusTier>[] | null | undefined): BonusTier[] {
  const byMin = new Map<number, BonusTier>();
  for (const t of Array.isArray(tiers) ? tiers : []) {
    const minAmount = Number(t?.minAmount);
    const bonus = Number(t?.bonus ?? 0);
    if (!Number.isFinite(minAmount) || minAmount <= 0 || !Number.isFinite(bonus) || bonus < 0) continue;
    const salary = t?.salary === undefined || t?.salary === null ? NaN : Number(t.salary);
    byMin.set(minAmount, Number.isFinite(salary) && salary > 0 ? { minAmount, bonus, salary } : { minAmount, bonus });
  }
  return [...byMin.values()].sort((a, b) => a.minAmount - b.minAmount);
}

/** True when the ladder pays by salary (any tier has one): bonus = tier salary − rep salary. */
export const paysBySalary = (tiers: readonly BonusTier[]): boolean => tiers.some((t) => (t.salary ?? 0) > 0);

/**
 * Sales bonus of a reached tier. By salary: tier salary − rep salary, never below 0, and 0 while the
 * rep's salary is not set (null). Otherwise the tier's bonus.
 */
export function tierBonusAmount(tier: BonusTier, bySalary: boolean, repSalary: number | null): number {
  if (!bySalary) return tier.bonus;
  if (repSalary === null) return 0;
  return Math.max(0, (tier.salary ?? 0) - repSalary);
}

/** Bonus settings of a company; nothing is paid until they are set (or before the migration ran). */
export function bonusSettings(source: Partial<BonusSettings>): BonusSettings {
  const from = source.newCustomerFrom ? String(source.newCustomerFrom).slice(0, 10) : null;
  return {
    bonusBase: source.bonusBase === 'SALE_ORDER' ? 'SALE_ORDER' : 'COLLECTION',
    bonusTiers: normalizeTiers(source.bonusTiers), newCustomerBonus: Math.max(0, Number(source.newCustomerBonus ?? 0) || 0), newCustomerFrom: from,
  };
}

/** The highest tier `amount` reaches (index 1 = lowest), or null below the first tier. */
export function pickTier(tiers: readonly BonusTier[], amount: number): (BonusTier & { index: number }) | null {
  const sorted = normalizeTiers(tiers);
  for (let i = sorted.length - 1; i >= 0; i--) if (amount >= sorted[i].minAmount) return { ...sorted[i], index: i + 1 };
  return null;
}

/** A customer's first-ever posted invoice, read from Odoo. */
export type FirstInvoice = { partnerId: number; partnerName: string; partnerCreated: string | null; invoiceId: number; invoiceName: string };

export type NewCustomerRow = Omit<NewCustomer, 'id' | 'sourceId'>;

/**
 * New customers of `period`: created in Odoo on or after `from`, not counted before, and whose
 * first-ever invoice had cash in this period (`lines`). The rep and cash date come from that cash.
 * `counted` must not contain the period's own rows (they are recomputed).
 */
export function planNewCustomers(input: {
  period: string;
  from: string | null;
  counted: ReadonlySet<number>;
  firsts: readonly FirstInvoice[];
  lines: readonly { kind: string; invoiceId: number | null; cashDate: string; odooUserId: number | null; repName: string | null }[];
}): NewCustomerRow[] {
  if (!input.from) return [];
  const cash = new Map<number, { cashDate: string; odooUserId: number | null; repName: string | null }>();
  for (const line of input.lines) {
    if (line.kind !== 'COLLECTION' || line.invoiceId === null) continue;
    const seen = cash.get(line.invoiceId);
    if (!seen || line.cashDate < seen.cashDate) cash.set(line.invoiceId, { cashDate: line.cashDate, odooUserId: line.odooUserId, repName: line.repName });
  }
  const out: NewCustomerRow[] = [];
  for (const first of input.firsts) {
    const paid = cash.get(first.invoiceId);
    if (!paid || input.counted.has(first.partnerId)) continue;
    if (!first.partnerCreated || first.partnerCreated < input.from) continue;
    out.push({
      odooPartnerId: first.partnerId, partnerName: first.partnerName, partnerCreated: first.partnerCreated, invoiceId: first.invoiceId, invoiceName: first.invoiceName,
      ...paid, period: input.period,
    });
  }
  return out;
}
