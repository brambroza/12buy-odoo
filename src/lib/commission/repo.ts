/**
 * Supabase access for the commission tables. Thin wrappers: validation lives in the actions,
 * rules in `calc.ts`. NUMERIC columns are converted to numbers on the way out.
 */
import { db } from '@/lib/db/client';
import { newId, rowOrNull, rows, toRow, unwrap } from '@/lib/db/rows';
import type {
  BonusSettings, TargetSettings, CommissionAdjustment, CommissionPricelist, CommissionRate, CommissionRep, CommissionRun, CommissionSalary, CommissionSource, CommissionTarget, SaleOrder, DebtHold, LedgerKind, LedgerLine,
  NewCustomer, OverdueStep, PriceGroup, RunStatus, StatementSettings, StoredLedgerLine,
} from './types';
import { bonusSettings, type NewCustomerRow } from './bonus';
import { targetSettings } from './target-mode';
import type { DeferredInvoice } from './ledger';
import type { PeriodOverride } from './period';
import type { NewHold } from './statement';

const num = (v: unknown) => Number(v ?? 0);
const now = () => new Date().toISOString();

// ---------- sources ----------

const toSource = (r: CommissionSource): CommissionSource => ({
  ...r, summaryLines: Array.isArray(r.summaryLines) ? r.summaryLines : [], centralPercent: num(r.centralPercent), debtDays: num(r.debtDays), debtPercent: num(r.debtPercent),
  // Missing before migration 20261106120000: pay on the last day of the next month.
  payDay: r.payDay == null ? 0 : num(r.payDay), payMonths: r.payMonths == null ? 1 : num(r.payMonths),
  // Missing before migration 20261106150000: no bonuses.
  ...bonusSettings(r),
  // Missing before migration 20261110200000: full commission when the target is met.
  ...targetSettings(r),
});

const missingTable = (message: string, table: string) => new RegExp(`${table}|schema cache|does not exist`, 'i').test(message);

export async function listSources(): Promise<CommissionSource[]> {
  return rows<CommissionSource>(await db().from('CommissionSource').select('*').order('name')).map(toSource);
}

export async function getSource(id: string): Promise<CommissionSource | null> {
  const row = rowOrNull<CommissionSource>(await db().from('CommissionSource').select('*').eq('id', id).maybeSingle());
  return row ? toSource(row) : null;
}

/** Saves the statement rows and deductions of a company (does not touch the connection). */
export async function updateStatementSettings(id: string, settings: StatementSettings): Promise<void> {
  unwrap(await db().from('CommissionSource').update({ ...settings, updatedAt: now() }).eq('id', id));
}

export type SourceInput = { name: string; url: string; db: string; username: string; apiKeyEnc: string; cutoffDay: number; payDay: number; payMonths: number; active: boolean };

export async function createSource(input: SourceInput): Promise<string> {
  const id = newId();
  unwrap(await db().from('CommissionSource').insert({ id, ...input, createdAt: now(), updatedAt: now() }));
  return id;
}

export async function updateSource(id: string, patch: Partial<SourceInput>): Promise<void> {
  unwrap(await db().from('CommissionSource').update(toRow({ ...patch, updatedAt: now() })).eq('id', id));
}

/** Saves the bonus ladder and the new-customer bonus of a company. */
export async function updateBonusSettings(id: string, settings: BonusSettings): Promise<void> {
  const result = await db().from('CommissionSource').update({ ...settings, updatedAt: now() }).eq('id', id);
  // Before migration 20261110150000 there is no bonusBase column: keeping collections still saves.
  if (result.error && settings.bonusBase === 'COLLECTION' && missingTable(result.error.message, 'bonusBase')) {
    const { bonusBase: _omit, ...rest } = settings;
    void _omit;
    unwrap(await db().from('CommissionSource').update({ ...rest, updatedAt: now() }).eq('id', id));
    return;
  }
  unwrap(result);
}

/** Saves how the target turns into commission. Before migration 20261110200000 only GATE (the old rule) can be kept. */
export async function updateTargetSettings(id: string, settings: TargetSettings): Promise<void> {
  const result = await db().from('CommissionSource').update({ ...settings, updatedAt: now() }).eq('id', id);
  if (result.error && missingTable(result.error.message, 'target(Mode|Steps)')) {
    if (settings.targetMode === 'GATE') return;
    throw new Error('ยังไม่ได้รัน migration 20261110200000_commission_target_mode.sql จึงเลือกแบบเป้าอื่นไม่ได้');
  }
  unwrap(result);
}

// ---------- new customers ----------

const toNewCustomer = (r: NewCustomer): NewCustomer => ({
  ...r, cashDate: String(r.cashDate).slice(0, 10), partnerCreated: r.partnerCreated ? String(r.partnerCreated).slice(0, 10) : null,
});

/** Customers counted as new by a company, oldest period first. Empty until migration 20261106150000 has run. */
export async function listNewCustomers(sourceId: string): Promise<NewCustomer[]> {
  const out: NewCustomer[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await db().from('CommissionNewCustomer').select('*').eq('sourceId', sourceId).order('period').order('cashDate').range(from, from + 999);
    if (result.error && missingTable(result.error.message, 'CommissionNewCustomer')) return [];
    const page = rows<NewCustomer>(result).map(toNewCustomer);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** Replaces the new customers counted in one period with a fresh pull. */
export async function replaceNewCustomers(sourceId: string, period: string, list: NewCustomerRow[]): Promise<void> {
  const cleared = await db().from('CommissionNewCustomer').delete().eq('sourceId', sourceId).eq('period', period);
  if (cleared.error && missingTable(cleared.error.message, 'CommissionNewCustomer')) {
    if (list.length) throw new Error('ยังไม่ได้รัน migration 20261106150000_commission_bonus.sql');
    return;
  }
  unwrap(cleared);
  const createdAt = now();
  const payload = list.map((c) => ({ id: newId(), sourceId, ...c, createdAt }));
  for (let i = 0; i < payload.length; i += 500) unwrap(await db().from('CommissionNewCustomer').insert(payload.slice(i, i + 500)));
}

// ---------- sale orders (incentive base) ----------

/** Confirmed sale orders pulled for a period; [] before migration 20261110150000 ran. */
export async function listSaleOrders(sourceId: string, period: string): Promise<SaleOrder[]> {
  const out: SaleOrder[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await db().from('CommissionSaleOrder').select('orderId,orderName,orderDate,partnerName,odooUserId,repName,amountUntaxed,amountTotal,period')
      .eq('sourceId', sourceId).eq('period', period).order('orderDate').order('orderId').range(from, from + 999);
    if (result.error && missingTable(result.error.message, 'CommissionSaleOrder')) return [];
    const page = rows<SaleOrder>(result).map((r) => ({ ...r, orderDate: String(r.orderDate).slice(0, 10), amountUntaxed: num(r.amountUntaxed), amountTotal: num(r.amountTotal) }));
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** Replaces a period's sale orders with a fresh pull. */
export async function replaceSaleOrders(sourceId: string, period: string, list: readonly SaleOrder[]): Promise<void> {
  const cleared = await db().from('CommissionSaleOrder').delete().eq('sourceId', sourceId).eq('period', period);
  if (cleared.error && missingTable(cleared.error.message, 'CommissionSaleOrder')) throw new Error('ยังไม่ได้รัน migration 20261110150000_commission_sale_orders.sql');
  unwrap(cleared);
  const createdAt = now();
  const payload = list.map((o) => ({ id: newId(), sourceId, ...o, createdAt }));
  for (let i = 0; i < payload.length; i += 500) unwrap(await db().from('CommissionSaleOrder').insert(payload.slice(i, i + 500)));
}

// ---------- period dates ----------

const toOverride = (r: PeriodOverride & { endDate: string | null; payDate: string | null }): PeriodOverride => ({
  period: r.period, endDate: r.endDate ? String(r.endDate).slice(0, 10) : null, payDate: r.payDate ? String(r.payDate).slice(0, 10) : null, note: r.note ?? null, updatedAt: r.updatedAt ?? null,
});

/** Periods of a company with their own end / pay date. Empty until migration 20261106120000 has run. */
export async function listPeriodOverrides(sourceId: string): Promise<PeriodOverride[]> {
  const result = await db().from('CommissionPeriod').select('period,endDate,payDate,note,updatedAt').eq('sourceId', sourceId).order('period');
  if (result.error && /CommissionPeriod|schema cache|does not exist/i.test(result.error.message)) return [];
  return rows<PeriodOverride & { endDate: string | null; payDate: string | null }>(result).map(toOverride);
}

/** Sets (or, with both dates null, clears) one period's own end and pay date. */
export async function savePeriodOverride(sourceId: string, input: { period: string; endDate: string | null; payDate: string | null; note: string | null }, actorId: string): Promise<void> {
  if (!input.endDate && !input.payDate) {
    unwrap(await db().from('CommissionPeriod').delete().eq('sourceId', sourceId).eq('period', input.period));
    return;
  }
  unwrap(await db().from('CommissionPeriod').upsert(
    { id: newId(), sourceId, ...input, updatedById: actorId, updatedAt: now() },
    { onConflict: 'sourceId,period' },
  ));
}

// ---------- reps ----------

export async function listReps(sourceId: string): Promise<CommissionRep[]> {
  return rows<CommissionRep>(await db().from('CommissionRep').select('*').eq('sourceId', sourceId).order('name'));
}

/** Reps linked to a web login (for "my commission"), across companies. */
export async function listRepsOfUser(userId: string): Promise<CommissionRep[]> {
  return rows<CommissionRep>(await db().from('CommissionRep').select('*').eq('userId', userId).eq('active', true));
}

/**
 * Adds reps not yet known (by rep key) and refreshes the names of the others; links and flags are kept.
 * `merged` maps an old user rep key to the tag rep that replaces it: the user rep is turned off and its
 * web login moved to the tag rep when that one has none.
 */
export async function upsertReps(sourceId: string, reps: { id: number; name: string }[], merged: Map<number, number> = new Map()): Promise<{ added: number; merged: number }> {
  const existing = new Map((await listReps(sourceId)).map((r) => [r.odooUserId, r]));
  let added = 0;
  for (const rep of reps) {
    const current = existing.get(rep.id);
    if (current) {
      if (current.name !== rep.name) unwrap(await db().from('CommissionRep').update({ name: rep.name }).eq('id', current.id));
    } else {
      const row = { id: newId(), sourceId, odooUserId: rep.id, name: rep.name, userId: null, active: true };
      unwrap(await db().from('CommissionRep').insert(row));
      existing.set(rep.id, { ...row } as CommissionRep);
      added += 1;
    }
  }
  let moved = 0;
  for (const [oldKey, newKey] of merged) {
    const old = existing.get(oldKey);
    const target = existing.get(newKey);
    if (!old?.active || !target) continue;
    if (old.userId && !target.userId) unwrap(await db().from('CommissionRep').update({ userId: old.userId }).eq('id', target.id));
    unwrap(await db().from('CommissionRep').update({ active: false, userId: null }).eq('id', old.id));
    moved += 1;
  }
  return { added, merged: moved };
}

export async function updateRep(id: string, sourceId: string, patch: { userId?: string | null; active?: boolean }): Promise<void> {
  unwrap(await db().from('CommissionRep').update(toRow(patch)).eq('id', id).eq('sourceId', sourceId));
}

/** Staff logins a rep can be linked to. */
export async function listStaffUsers(): Promise<{ id: string; name: string; email: string }[]> {
  return unwrap(await db().from('User').select('id,name,email').in('role', ['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE']).eq('isActive', true).order('name')) ?? [];
}

// ---------- pricelists ----------

const toPricelist = (r: CommissionPricelist): CommissionPricelist => ({ ...r, specialPercent: num(r.specialPercent) });

export async function listPricelists(sourceId: string): Promise<CommissionPricelist[]> {
  return rows<CommissionPricelist>(await db().from('CommissionPricelist').select('*').eq('sourceId', sourceId).order('name')).map(toPricelist);
}

/** Adds pricelists not yet known (as OTHER) and refreshes names. */
export async function upsertPricelists(sourceId: string, pricelists: { id: number; name: string }[]): Promise<number> {
  const existing = new Map((await listPricelists(sourceId)).map((p) => [p.odooPricelistId, p]));
  let added = 0;
  for (const pl of pricelists) {
    const row = existing.get(pl.id);
    if (row) {
      if (row.name !== pl.name) unwrap(await db().from('CommissionPricelist').update({ name: pl.name }).eq('id', row.id));
    } else {
      unwrap(await db().from('CommissionPricelist').insert({ id: newId(), sourceId, odooPricelistId: pl.id, name: pl.name, priceGroup: 'OTHER', isSpecial: false, specialPercent: 50 }));
      added += 1;
    }
  }
  return added;
}

export async function updatePricelist(id: string, sourceId: string, patch: { priceGroup: PriceGroup; isSpecial: boolean; specialPercent: number }): Promise<void> {
  unwrap(await db().from('CommissionPricelist').update(patch).eq('id', id).eq('sourceId', sourceId));
}

// ---------- rates ----------

const toRate = (r: CommissionRate): CommissionRate => ({ ...r, value: num(r.value) });

export async function listRates(sourceId: string): Promise<CommissionRate[]> {
  return rows<CommissionRate>(await db().from('CommissionRate').select('*').eq('sourceId', sourceId).order('validFrom', { ascending: false })).map(toRate);
}

export async function createRate(input: Omit<CommissionRate, 'id'>, actorId: string): Promise<void> {
  unwrap(await db().from('CommissionRate').insert({ id: newId(), ...input, createdById: actorId, createdAt: now() }));
}

/** Ends a rate on `validTo` (rates are never edited in place so past periods keep their numbers). */
export async function endRate(id: string, sourceId: string, validTo: string): Promise<void> {
  unwrap(await db().from('CommissionRate').update({ validTo }).eq('id', id).eq('sourceId', sourceId));
}

/** Deletes a rate that was never used by an approved run (the caller checks). */
export async function deleteRate(id: string, sourceId: string): Promise<void> {
  unwrap(await db().from('CommissionRate').delete().eq('id', id).eq('sourceId', sourceId));
}

// ---------- overdue steps ----------

const toStep = (r: OverdueStep): OverdueStep => ({ ...r, percent: num(r.percent) });

export async function listSteps(sourceId: string): Promise<OverdueStep[]> {
  return rows<OverdueStep>(await db().from('CommissionOverdueStep').select('*').eq('sourceId', sourceId).order('minDays')).map(toStep);
}

export async function createStep(input: Omit<OverdueStep, 'id'>): Promise<void> {
  unwrap(await db().from('CommissionOverdueStep').insert({ id: newId(), ...input, createdAt: now() }));
}

export async function endStep(id: string, sourceId: string, validTo: string): Promise<void> {
  unwrap(await db().from('CommissionOverdueStep').update({ validTo }).eq('id', id).eq('sourceId', sourceId));
}

export async function deleteStep(id: string, sourceId: string): Promise<void> {
  unwrap(await db().from('CommissionOverdueStep').delete().eq('id', id).eq('sourceId', sourceId));
}

// ---------- targets ----------

const toTarget = (r: CommissionTarget): CommissionTarget => ({ ...r, amount: num(r.amount) });

export async function listTargets(sourceId: string, period: string): Promise<CommissionTarget[]> {
  return rows<CommissionTarget>(await db().from('CommissionTarget').select('*').eq('sourceId', sourceId).eq('period', period)).map(toTarget);
}

/** Sets (amount) or clears (null) targets for one period. */
export async function saveTargets(sourceId: string, period: string, values: Map<number, number | null>, actorId: string): Promise<void> {
  for (const [odooUserId, amount] of values) {
    if (amount === null) {
      unwrap(await db().from('CommissionTarget').delete().eq('sourceId', sourceId).eq('period', period).eq('odooUserId', odooUserId));
    } else {
      unwrap(await db().from('CommissionTarget').upsert(
        { id: newId(), sourceId, period, odooUserId, amount, updatedById: actorId, updatedAt: now() },
        { onConflict: 'sourceId,odooUserId,period' },
      ));
    }
  }
}

// ---------- salaries ----------

/** Rep salaries of one period; [] before migration 20261110120000 ran. */
export async function listSalaries(sourceId: string, period: string): Promise<CommissionSalary[]> {
  const result = await db().from('CommissionSalary').select('odooUserId, period, amount').eq('sourceId', sourceId).eq('period', period);
  if (result.error && missingTable(result.error.message, 'CommissionSalary')) return [];
  return rows<CommissionSalary>(result).map((r) => ({ odooUserId: r.odooUserId, period: r.period, amount: num(r.amount) }));
}

/** Sets (amount) or clears (null) rep salaries for one period. */
export async function saveSalaries(sourceId: string, period: string, values: Map<number, number | null>, actorId: string): Promise<void> {
  for (const [odooUserId, amount] of values) {
    if (amount === null) {
      unwrap(await db().from('CommissionSalary').delete().eq('sourceId', sourceId).eq('period', period).eq('odooUserId', odooUserId));
    } else {
      unwrap(await db().from('CommissionSalary').upsert(
        { id: newId(), sourceId, period, odooUserId, amount, updatedById: actorId, updatedAt: now() },
        { onConflict: 'sourceId,odooUserId,period' },
      ));
    }
  }
}

// ---------- ledger ----------

const toLedger = (r: StoredLedgerLine): StoredLedgerLine => ({ ...r, qty: num(r.qty), base: num(r.base), gross: num(r.gross), issues: r.issues ?? [] });

export async function listLedger(sourceId: string, period: string): Promise<StoredLedgerLine[]> {
  const out: StoredLedgerLine[] = [];
  // PostgREST caps a response at 1000 rows by default; page through.
  for (let from = 0; ; from += 1000) {
    const page = rows<StoredLedgerLine>(await db().from('CommissionLedger').select('*').eq('sourceId', sourceId).eq('period', period)
      .order('cashDate').order('lineKey').range(from, from + 999)).map(toLedger);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** What has been booked for a locked period: its own lines plus corrections booked in later periods (except `skipPeriod`). */
export async function listBookedFor(sourceId: string, originPeriod: string, skipPeriod: string): Promise<StoredLedgerLine[]> {
  const out: StoredLedgerLine[] = [];
  for (let from = 0; ; from += 1000) {
    const page = rows<StoredLedgerLine>(await db().from('CommissionLedger').select('*').eq('sourceId', sourceId).eq('originPeriod', originPeriod)
      .neq('period', skipPeriod).order('lineKey').range(from, from + 999)).map(toLedger);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** Replaces the lines of one kind in a period with a fresh pull. */
export async function replaceLedger(sourceId: string, period: string, kind: LedgerKind, lines: LedgerLine[]): Promise<void> {
  unwrap(await db().from('CommissionLedger').delete().eq('sourceId', sourceId).eq('period', period).eq('kind', kind));
  const createdAt = now();
  const payload = lines.map((l) => ({ id: newId(), sourceId, period, ...l, createdAt }));
  for (let i = 0; i < payload.length; i += 500) unwrap(await db().from('CommissionLedger').insert(payload.slice(i, i + 500)));
}

// ---------- overdue-invoice holds ----------

const toHold = (r: DebtHold): DebtHold => ({ ...r, residualBase: num(r.residualBase), percent: num(r.percent), amount: num(r.amount) });

export async function listDebtHolds(sourceId: string): Promise<DebtHold[]> {
  const out: DebtHold[] = [];
  for (let from = 0; ; from += 1000) {
    const page = rows<DebtHold>(await db().from('CommissionDebtHold').select('*').eq('sourceId', sourceId).order('heldPeriod').order('invoiceName').range(from, from + 999)).map(toHold);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/**
 * Replaces what a fresh pull of `period` decides about holds: drops the period's own holds that
 * were not given back yet, undoes the period's give-backs, then stores the new plan.
 */
export async function applyDebtPlan(sourceId: string, period: string, holds: NewHold[], releaseIds: string[]): Promise<void> {
  unwrap(await db().from('CommissionDebtHold').delete().eq('sourceId', sourceId).eq('heldPeriod', period).is('releasedPeriod', null));
  unwrap(await db().from('CommissionDebtHold').update({ releasedPeriod: null }).eq('sourceId', sourceId).eq('releasedPeriod', period));
  const createdAt = now();
  const payload = holds.map((h) => ({ id: newId(), sourceId, ...h, createdAt }));
  for (let i = 0; i < payload.length; i += 500) unwrap(await db().from('CommissionDebtHold').insert(payload.slice(i, i + 500)));
  for (let i = 0; i < releaseIds.length; i += 200) {
    unwrap(await db().from('CommissionDebtHold').update({ releasedPeriod: period }).eq('sourceId', sourceId).in('id', releaseIds.slice(i, i + 200)));
  }
}

// ---------- runs ----------

const toRun = (r: CommissionRun): CommissionRun => ({ ...r, totalPayable: num(r.totalPayable) });

export async function listRuns(sourceId: string): Promise<CommissionRun[]> {
  return rows<CommissionRun>(await db().from('CommissionRun').select('id,sourceId,period,status,syncedAt,calculatedAt,totalPayable,submittedById,submittedAt,approvedById,approvedAt,paidAt,createdAt,updatedAt')
    .eq('sourceId', sourceId).order('period', { ascending: false })).map((r) => toRun({ ...r, snapshot: null, results: null }));
}

/**
 * Collected (before VAT) and counted-for-commission totals per period, for the runs list. Read from
 * the calculated results (only their rep totals, not the lines); `counted` is null for a period not
 * calculated yet, whose collected total then comes from the pulled ledger.
 */
export async function runTotals(sourceId: string, uncalculated: readonly string[]): Promise<Map<string, { collected: number; counted: number | null }>> {
  type Row = { period: string; reps: { base?: number; counted?: number }[] | null; unassigned: number | null };
  const out = new Map<string, { collected: number; counted: number | null }>();
  for (const r of rows<Row>(await db().from('CommissionRun').select('period, reps:results->reps, unassigned:results->unassignedBase').eq('sourceId', sourceId))) {
    if (!r.reps) continue;
    const collected = r.reps.reduce((s, x) => s + num(x.base ?? 0), 0) + num(r.unassigned ?? 0);
    const counted = r.reps.reduce((s, x) => s + num(x.counted ?? x.base ?? 0), 0);
    out.set(r.period, { collected: Math.round(collected * 100) / 100, counted: Math.round(counted * 100) / 100 });
  }
  for (const period of uncalculated) {
    if (out.has(period)) continue;
    let collected = 0;
    for (let from = 0; ; from += 1000) {
      const page = rows<{ base: number }>(await db().from('CommissionLedger').select('base').eq('sourceId', sourceId).eq('period', period).range(from, from + 999));
      collected += page.reduce((s, x) => s + num(x.base), 0);
      if (page.length < 1000) break;
    }
    out.set(period, { collected: Math.round(collected * 100) / 100, counted: null });
  }
  return out;
}

export async function getRun(sourceId: string, period: string): Promise<CommissionRun | null> {
  const run = rowOrNull<CommissionRun>(await db().from('CommissionRun').select('*').eq('sourceId', sourceId).eq('period', period).maybeSingle());
  return run ? toRun(run) : null;
}

/** The run of a period, created as an empty draft when missing. */
export async function ensureRun(sourceId: string, period: string): Promise<CommissionRun> {
  const existing = await getRun(sourceId, period);
  if (existing) return existing;
  unwrap(await db().from('CommissionRun').upsert({ id: newId(), sourceId, period, status: 'DRAFT', createdAt: now(), updatedAt: now() }, { onConflict: 'sourceId,period', ignoreDuplicates: true }));
  return (await getRun(sourceId, period))!;
}

/**
 * Updates a run only while it is in one of `fromStatus` (compare-and-set), so two people clicking
 * at once cannot both approve, and an approved run cannot be recalculated. Returns false when it moved.
 */
export async function updateRun(id: string, fromStatus: RunStatus[], patch: Partial<Omit<CommissionRun, 'id' | 'sourceId' | 'period' | 'createdAt'>>): Promise<boolean> {
  const data = unwrap(await db().from('CommissionRun').update(toRow({ ...patch, updatedAt: new Date() })).eq('id', id).in('status', fromStatus).select('id'));
  return Array.isArray(data) && data.length > 0;
}

/** Stores the invoices waiting to be fully paid; skipped before migration 20261110170000 ran. */
export async function saveDeferred(runId: string, deferred: readonly DeferredInvoice[]): Promise<void> {
  const result = await db().from('CommissionRun').update({ deferred }).eq('id', runId);
  if (result.error && missingTable(result.error.message, 'deferred')) return;
  unwrap(result);
}

/** Invoices of a period waiting to be fully paid ([] before the migration or the first pull). */
export async function listDeferred(sourceId: string, period: string): Promise<DeferredInvoice[]> {
  const result = await db().from('CommissionRun').select('deferred').eq('sourceId', sourceId).eq('period', period).maybeSingle();
  if (result.error && missingTable(result.error.message, 'deferred')) return [];
  const row = rowOrNull<{ deferred: DeferredInvoice[] | null }>(result);
  return Array.isArray(row?.deferred) ? row.deferred : [];
}

// ---------- adjustments ----------

const toAdjustment = (r: CommissionAdjustment): CommissionAdjustment => ({ ...r, amount: num(r.amount) });

export async function listAdjustments(runId: string): Promise<CommissionAdjustment[]> {
  return rows<CommissionAdjustment>(await db().from('CommissionAdjustment').select('*').eq('runId', runId).order('createdAt')).map(toAdjustment);
}

export async function addAdjustment(input: { runId: string; odooUserId: number; amount: number; reason: string }, actorId: string): Promise<void> {
  unwrap(await db().from('CommissionAdjustment').insert({ id: newId(), ...input, createdById: actorId, createdAt: now() }));
}

export async function deleteAdjustment(id: string, runId: string): Promise<void> {
  unwrap(await db().from('CommissionAdjustment').delete().eq('id', id).eq('runId', runId));
}
