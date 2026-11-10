/**
 * Commission workflow: pull a period's cash-in from the company's Odoo into the ledger, calculate
 * the run, then submit → approve (another person) → paid. Approved runs are frozen; a later pull of
 * the next period books any change Odoo made to the locked period as RETRO lines.
 */
import { createOdooReadClient, type OdooReadClient } from '@/lib/odoo/rpc';
import { decryptSecret } from '@/lib/settings/crypto';
import { bonusSettings, planNewCustomers, type NewCustomerRow } from './bonus';
import { blockingIssues, calculateRun } from './calc';
import { isTagRep, retroDiff } from './ledger';
import { fetchCollections, fetchCredits, fetchFirstInvoices, fetchOverdueInvoices, fetchPaidInvoiceIds, fetchInvoiceSales, fetchRepDirectory, fetchSaleOrders } from './odoo';
import { calendarOf, periodDates, shiftPeriod, type PeriodCalendar } from './period';
import * as repo from './repo';
import { planDebt, statementSettings } from './statement';
import { isSalesBase, type CommissionRun, type CommissionSource, type DebtHold, type LedgerLine, type RunSnapshot } from './types';

const clients = new Map<string, { stamp: string; client: OdooReadClient }>();

/** Read-only Odoo client of a company, rebuilt when its connection is saved again. */
export function clientFor(source: CommissionSource): OdooReadClient {
  const stamp = `${source.updatedAt instanceof Date ? source.updatedAt.toISOString() : String(source.updatedAt)}`;
  const cached = clients.get(source.id);
  if (cached && cached.stamp === stamp) return cached.client;
  const client = createOdooReadClient({ url: source.url, db: source.db, username: source.username, apiKey: decryptSecret(source.apiKeyEnc) });
  clients.set(source.id, { stamp, client });
  return client;
}

/** Like `clientFor` but null when the saved API key cannot be decrypted (pages degrade instead of failing). */
export function tryClientFor(source: CommissionSource): OdooReadClient | null {
  try {
    return clientFor(source);
  } catch {
    return null;
  }
}

/** Forgets a company's client (after its connection changed). */
export function forgetClient(sourceId: string): void {
  clients.delete(sourceId);
}

const LOCKED: CommissionRun['status'][] = ['APPROVED', 'PAID'];
const OPEN: CommissionRun['status'][] = ['DRAFT', 'PENDING_APPROVAL'];

/** Period calendar of a company: its rule plus periods with their own end / pay date. */
export async function periodCalendar(source: CommissionSource): Promise<PeriodCalendar> {
  return calendarOf(source, await repo.listPeriodOverrides(source.id));
}

/** First and last day (inclusive) of a period, own end dates included. */
async function rangeOf(source: CommissionSource, period: string): Promise<{ start: string; end: string }> {
  const { start, end } = periodDates(await periodCalendar(source), period);
  return { start, end };
}

export type SyncResult =
  | { ok: true; lines: number; receipts: number; retro: number; refunds: { count: number; amount: number }; held: number; released: number; newCustomers: number; saleOrders: number | null; deferred: { count: number; cash: number } }
  | { ok: false; reason: string };

/**
 * Pulls cash received in `period` and stores it as the period's ledger. Refused once the run is
 * approved. When the previous period is locked it is read again and the differences are booked
 * here as RETRO lines. A pulled run goes back to draft so it must be calculated and approved again.
 */
/**
 * Pulls the reps from Odoo: customer tags "Sale …" (the real salespeople) plus internal users without
 * a matching tag. New ones are added and names refreshed; a user rep that now matches a tag is turned
 * off and its web login moved to the tag rep. Run on every period pull too, so every rep the ledger
 * pays exists on the targets / reps pages (otherwise their collections show as 0 there).
 */
export async function syncReps(source: CommissionSource, client: OdooReadClient = clientFor(source)): Promise<{ added: number; merged: number }> {
  const directory = await fetchRepDirectory(client);
  const reps = [...[...directory.tags.values()].map(([id, name]) => ({ id, name })), ...directory.users];
  return repo.upsertReps(source.id, reps, new Map([...directory.userReps].map(([userId, rep]) => [userId, rep[0]])));
}

/** A row of the targets page: a "Sale …" tag rep, or a salesperson that collected without a tag. */
export type TargetRep = { odooUserId: number; name: string; tag: boolean; collected: number };

/**
 * Who gets a target in a period, keyed like every other page (the ledger): every "Sale …" tag rep
 * (read live from Odoo, else from the reps list), plus any other rep key with collections or a
 * target / salary already set this period (e.g. a salesperson on customers without a tag). Reps
 * switched off on the reps page are left out. Tags first, by name.
 */
export async function targetReps(source: CommissionSource, period: string): Promise<{ reps: TargetRep[]; odooError: string | null }> {
  const [stored, ledger, targets, salaries] = await Promise.all([
    repo.listReps(source.id), repo.listLedger(source.id, period), repo.listTargets(source.id, period), repo.listSalaries(source.id, period),
  ]);
  const off = new Set(stored.filter((r) => !r.active).map((r) => r.odooUserId));
  const names = new Map<number, string>(stored.map((r) => [r.odooUserId, r.name]));
  const collected = new Map<number, number>();
  for (const l of ledger) {
    if (l.odooUserId === null) continue;
    collected.set(l.odooUserId, (collected.get(l.odooUserId) ?? 0) + l.base);
    if (!names.has(l.odooUserId) && l.repName) names.set(l.odooUserId, l.repName);
  }
  const keys = new Set<number>(stored.filter((r) => r.active && isTagRep(r.odooUserId)).map((r) => r.odooUserId));
  let odooError: string | null = null;
  const client = tryClientFor(source);
  if (client) {
    try {
      for (const [key, name] of (await fetchRepDirectory(client)).tags.values()) {
        keys.add(key);
        names.set(key, name);
      }
    } catch (error) {
      odooError = error instanceof Error ? error.message : String(error);
    }
  }
  for (const key of [...collected.keys(), ...targets.map((t) => t.odooUserId), ...salaries.map((x) => x.odooUserId)]) keys.add(key);
  const reps = [...keys].filter((key) => !off.has(key)).map((key) => ({
    odooUserId: key, name: names.get(key) ?? `#${key}`, tag: isTagRep(key), collected: Math.round((collected.get(key) ?? 0) * 100) / 100,
  }));
  reps.sort((a, b) => Number(b.tag) - Number(a.tag) || a.name.localeCompare(b.name, 'th'));
  return { reps, odooError };
}

export async function syncPeriod(source: CommissionSource, period: string): Promise<SyncResult> {
  const run = await repo.ensureRun(source.id, period);
  if (LOCKED.includes(run.status)) return { ok: false, reason: 'รอบนี้อนุมัติแล้ว ดึงข้อมูลใหม่ไม่ได้ (การเปลี่ยนแปลงใน Odoo จะถูกปรับปรุงในรอบถัดไป)' };
  const client = clientFor(source);
  const fetched = await fetchCollections(client, period, await rangeOf(source, period));

  const previous = shiftPeriod(period, -1);
  const previousRun = await repo.getRun(source.id, previous);
  let retro: ReturnType<typeof retroDiff> = [];
  if (previousRun && LOCKED.includes(previousRun.status)) {
    const fresh = await fetchCollections(client, previous, await rangeOf(source, previous));
    const booked = await repo.listBookedFor(source.id, previous, period);
    retro = retroDiff(booked, fresh.lines, previous);
  }

  const debt = await planPeriodDebt(source, period, client, fetched.lines);
  const newCustomers = await planPeriodNewCustomers(source, period, client, fetched.lines);
  // Sale orders only when the incentive is measured on them, so other companies pull exactly as before.
  const bonusBase = bonusSettings(source).bonusBase;
  const saleOrders = bonusBase === 'SALE_ORDER' ? await fetchSaleOrders(client, period, await rangeOf(source, period))
    : bonusBase === 'INVOICE' ? await fetchInvoiceSales(client, period, await rangeOf(source, period)) : null;

  // Lock check again right before writing: someone may have approved while Odoo was being read.
  const latest = await repo.getRun(source.id, period);
  if (!latest || LOCKED.includes(latest.status)) return { ok: false, reason: 'รอบนี้ถูกอนุมัติระหว่างดึงข้อมูล จึงไม่บันทึก' };
  await syncReps(source, client);
  await repo.replaceLedger(source.id, period, 'COLLECTION', fetched.lines);
  await repo.replaceLedger(source.id, period, 'RETRO', retro);
  await repo.applyDebtPlan(source.id, period, debt.holds, debt.releaseIds);
  await repo.replaceNewCustomers(source.id, period, newCustomers);
  if (saleOrders) await repo.replaceSaleOrders(source.id, period, saleOrders);
  await repo.saveDeferred(latest.id, fetched.deferred ?? []);
  await repo.updateRun(latest.id, OPEN, { status: 'DRAFT', syncedAt: new Date(), calculatedAt: null, results: null, snapshot: null, totalPayable: 0, submittedById: null, submittedAt: null });
  return {
    ok: true, lines: fetched.lines.length, receipts: fetched.receipts, retro: retro.length, refunds: fetched.refunds, held: debt.holds.length, released: debt.releaseIds.length,
    newCustomers: newCustomers.length, saleOrders: saleOrders?.length ?? null,
    deferred: { count: fetched.deferred?.length ?? 0, cash: Math.round((fetched.deferred ?? []).reduce((t, d) => t + d.cashThisPeriod, 0) * 100) / 100 },
  };
}

/**
 * New customers of a period being pulled: customers created on or after the company's start day
 * whose first-ever invoice had cash in this period, skipping those counted in another period.
 */
async function planPeriodNewCustomers(source: CommissionSource, period: string, client: OdooReadClient, lines: readonly LedgerLine[]): Promise<NewCustomerRow[]> {
  const { newCustomerFrom } = bonusSettings(source);
  if (!newCustomerFrom) return [];
  const counted = new Set((await repo.listNewCustomers(source.id)).filter((c) => c.period !== period).map((c) => c.odooPartnerId));
  const invoiceIds = [...new Set(lines.flatMap((l) => (l.kind === 'COLLECTION' && l.invoiceId !== null ? [l.invoiceId] : [])))];
  const firsts = await fetchFirstInvoices(client, invoiceIds);
  return planNewCustomers({ period, from: newCustomerFrom, counted, firsts, lines });
}

/**
 * Overdue-invoice holds for a period being pulled: invoices more than `debtDays` past due on the
 * period's last day are held (once), earlier holds whose invoice is now paid with cash collected in
 * this period are given back. The period's own earlier decisions are ignored so a re-pull redoes them.
 */
async function planPeriodDebt(source: CommissionSource, period: string, client: OdooReadClient, lines: readonly LedgerLine[]) {
  const settings = statementSettings(source);
  const asOf = (await rangeOf(source, period)).end;
  const existing = (await repo.listDebtHolds(source.id))
    .filter((h) => !(h.heldPeriod === period && h.releasedPeriod === null))
    .map((h) => (h.releasedPeriod === period ? { ...h, releasedPeriod: null } : h));
  const collected = new Set(lines.flatMap((l) => (l.invoiceId !== null ? [l.invoiceId] : [])));
  const waiting = existing.filter((h) => h.releasedPeriod === null && h.heldPeriod < period && collected.has(h.invoiceId)).map((h) => h.invoiceId);
  const [overdue, collectedPaid] = await Promise.all([
    settings.debtPercent > 0 ? fetchOverdueInvoices(client, asOf, settings.debtDays) : Promise.resolve([]),
    fetchPaidInvoiceIds(client, waiting),
  ]);
  return planDebt({ period, asOf, settings, existing, overdue, collectedPaid });
}

/** Rules and inputs a run is calculated with (also stored with the run). */
async function loadSnapshot(source: CommissionSource, run: CommissionRun): Promise<RunSnapshot> {
  const bonus = bonusSettings(source);
  const [rates, steps, pricelists, targets, adjustments, holds, newCustomers, salaries, saleOrders] = await Promise.all([
    repo.listRates(source.id), repo.listSteps(source.id), repo.listPricelists(source.id), repo.listTargets(source.id, run.period), repo.listAdjustments(run.id),
    periodHolds(source.id, run.period), periodNewCustomers(source.id, run.period), repo.listSalaries(source.id, run.period),
    isSalesBase(bonus.bonusBase) ? repo.listSaleOrders(source.id, run.period) : Promise.resolve(undefined),
  ]);
  return { rates, steps, pricelists, targets, salaries, adjustments, statement: statementSettings(source), holds, bonus, newCustomers, ...(saleOrders ? { saleOrders } : {}) };
}

/** New customers counted in a period. */
export async function periodNewCustomers(sourceId: string, period: string) {
  return (await repo.listNewCustomers(sourceId)).filter((c) => c.period === period);
}

/** Holds taken or given back in a period. */
async function periodHolds(sourceId: string, period: string): Promise<DebtHold[]> {
  return (await repo.listDebtHolds(sourceId)).filter((h) => h.heldPeriod === period || h.releasedPeriod === period);
}

/** Negative balances left by the previous period's approved run. */
async function carryInFor(sourceId: string, period: string): Promise<Map<number, number>> {
  const previous = await repo.getRun(sourceId, shiftPeriod(period, -1));
  const carry = new Map<number, number>();
  if (previous && LOCKED.includes(previous.status) && previous.results) {
    for (const rep of previous.results.reps) if (rep.carryOut < 0) carry.set(rep.odooUserId, rep.carryOut);
  }
  return carry;
}

export type RunResult = { ok: true; run: CommissionRun } | { ok: false; reason: string };

/** Calculates (or recalculates) a draft run from the stored ledger and the current rules. */
export async function calculatePeriod(source: CommissionSource, period: string): Promise<RunResult> {
  const run = await repo.ensureRun(source.id, period);
  if (run.status !== 'DRAFT') return { ok: false, reason: 'คำนวณใหม่ได้เฉพาะรอบที่เป็นร่าง (ถ้าส่งอนุมัติแล้ว ให้ตีกลับก่อน)' };
  if (!run.syncedAt) return { ok: false, reason: 'ดึงข้อมูลจาก Odoo ก่อนคำนวณ' };
  const [ledger, snapshot, reps, carryIn] = await Promise.all([repo.listLedger(source.id, period), loadSnapshot(source, run), repo.listReps(source.id), carryInFor(source.id, period)]);
  const inactive = new Set(reps.filter((r) => !r.active).map((r) => r.odooUserId));
  // Credit notes are for display only; if Odoo cannot be read the run still calculates, with a note.
  let creditError: string | null = null;
  const credits = await fetchCredits(clientFor(source), await rangeOf(source, period)).catch((error: unknown) => {
    creditError = error instanceof Error ? error.message : String(error);
    return null;
  });
  if (credits) Object.assign(snapshot, credits);
  const results = calculateRun({ lines: ledger, ...snapshot, reps, inactive, carryIn, period });
  if (creditError) results.issues.push({ message: `ดึงใบลดหนี้ (CN) จาก Odoo ไม่ได้ จึงไม่แสดงยอด CN: ${creditError}` });
  const moved = await repo.updateRun(run.id, ['DRAFT'], { calculatedAt: new Date(), results, snapshot, totalPayable: results.totalPayable });
  if (!moved) return { ok: false, reason: 'สถานะรอบเปลี่ยนระหว่างคำนวณ ลองใหม่' };
  return { ok: true, run: (await repo.getRun(source.id, period))! };
}

/** Draft → pending approval. Needs a calculation and a target for every rep with sales. */
export async function submitRun(sourceId: string, period: string, actorId: string): Promise<RunResult> {
  const run = await repo.getRun(sourceId, period);
  if (!run || run.status !== 'DRAFT') return { ok: false, reason: 'ส่งอนุมัติได้เฉพาะรอบที่เป็นร่าง' };
  if (!run.results || !run.calculatedAt) return { ok: false, reason: 'กดคำนวณก่อนส่งอนุมัติ' };
  const blocking = blockingIssues(run.results);
  if (blocking.length) return { ok: false, reason: blocking[0] + (blocking.length > 1 ? ` และอีก ${blocking.length - 1} รายการ` : '') };
  const moved = await repo.updateRun(run.id, ['DRAFT'], { status: 'PENDING_APPROVAL', submittedById: actorId, submittedAt: new Date() });
  return moved ? { ok: true, run: (await repo.getRun(sourceId, period))! } : { ok: false, reason: 'สถานะรอบเปลี่ยนแล้ว ลองโหลดหน้าใหม่' };
}

/** Pending → approved (locked). The approver must not be the person who submitted. */
export async function approveRun(sourceId: string, period: string, actorId: string): Promise<RunResult> {
  const run = await repo.getRun(sourceId, period);
  if (!run || run.status !== 'PENDING_APPROVAL') return { ok: false, reason: 'รอบนี้ยังไม่ได้ส่งอนุมัติ' };
  if (run.submittedById === actorId) return { ok: false, reason: 'ผู้อนุมัติต้องไม่ใช่คนเดียวกับผู้ส่ง (ให้อีกคนเข้าสู่ระบบแล้วกดอนุมัติ)' };
  const moved = await repo.updateRun(run.id, ['PENDING_APPROVAL'], { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() });
  return moved ? { ok: true, run: (await repo.getRun(sourceId, period))! } : { ok: false, reason: 'สถานะรอบเปลี่ยนแล้ว ลองโหลดหน้าใหม่' };
}

/** Pending → draft (sent back for changes). */
export async function rejectRun(sourceId: string, period: string): Promise<RunResult> {
  const run = await repo.getRun(sourceId, period);
  if (!run || run.status !== 'PENDING_APPROVAL') return { ok: false, reason: 'ตีกลับได้เฉพาะรอบที่รออนุมัติ' };
  const moved = await repo.updateRun(run.id, ['PENDING_APPROVAL'], { status: 'DRAFT', submittedById: null, submittedAt: null });
  return moved ? { ok: true, run: (await repo.getRun(sourceId, period))! } : { ok: false, reason: 'สถานะรอบเปลี่ยนแล้ว' };
}

/** Approved → paid. */
export async function markRunPaid(sourceId: string, period: string): Promise<RunResult> {
  const run = await repo.getRun(sourceId, period);
  if (!run || run.status !== 'APPROVED') return { ok: false, reason: 'บันทึกจ่ายได้เฉพาะรอบที่อนุมัติแล้ว' };
  const moved = await repo.updateRun(run.id, ['APPROVED'], { status: 'PAID', paidAt: new Date() });
  return moved ? { ok: true, run: (await repo.getRun(sourceId, period))! } : { ok: false, reason: 'สถานะรอบเปลี่ยนแล้ว' };
}

/** True when the run of a period is approved or paid (rules for its dates are then frozen in its snapshot). */
export function isLocked(run: Pick<CommissionRun, 'status'> | null): boolean {
  return Boolean(run && LOCKED.includes(run.status));
}

/**
 * Estimate for one rep in a period that is not approved yet, from the last pull and today's rules
 * (for "my commission"). Approved periods return the stored result instead.
 */
export async function repEstimate(source: CommissionSource, period: string, odooUserId: number) {
  const run = await repo.getRun(source.id, period);
  if (run && isLocked(run) && run.results) return { locked: true, run, rep: run.results.reps.find((r) => r.odooUserId === odooUserId) ?? null };
  const [ledger, rates, steps, pricelists, targets, carryIn, holds, newCustomers, salaries, saleOrders] = await Promise.all([
    repo.listLedger(source.id, period), repo.listRates(source.id), repo.listSteps(source.id), repo.listPricelists(source.id), repo.listTargets(source.id, period), carryInFor(source.id, period),
    periodHolds(source.id, period), periodNewCustomers(source.id, period), repo.listSalaries(source.id, period),
    isSalesBase(bonusSettings(source).bonusBase) ? repo.listSaleOrders(source.id, period) : Promise.resolve([]),
  ]);
  const lines = ledger.filter((l) => l.odooUserId === odooUserId);
  const results = calculateRun({
    lines, rates, steps, pricelists, targets, adjustments: [], reps: [], carryIn: new Map([...carryIn].filter(([id]) => id === odooUserId)), period,
    statement: statementSettings(source), holds: holds.filter((h) => h.odooUserId === odooUserId),
    bonus: bonusSettings(source), newCustomers: newCustomers.filter((c) => c.odooUserId === odooUserId), salaries,
    saleOrders: saleOrders.filter((o) => o.odooUserId === odooUserId),
  });
  return { locked: false, run, rep: results.reps.find((r) => r.odooUserId === odooUserId) ?? null };
}
