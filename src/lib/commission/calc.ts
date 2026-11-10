/**
 * Commission calculator. Per ledger line:
 *   rate (% of base before VAT, or baht per unit) × special-price % × overdue-step %
 * then per rep: no pay when the period's collected base is below the target (gate), statement rows,
 * central fund and overdue-invoice deductions, manual adjustments and any negative balance carried
 * from the previous period. Pure, no I/O.
 */
import { paysBySalary, pickTier, tierBonusAmount } from './bonus';
import { OTHER_SUMMARY, statementSettings, summaryKeyOf } from './statement';
import { achievementPercent, targetPayPercent, targetSettings } from './target-mode';
import type {
  BonusSettings, TargetSettings, CommissionAdjustment, CommissionPricelist, CommissionRate, CommissionRep, CommissionSalary, CommissionTarget, CreditNote, SaleOrder, DebtHold, ExcludedAmount, ExcludedReason, LedgerLine, LineResult,
  NewCustomer, OverdueStep, PriceGroup, RepResult, RunResults, StatementSettings, StepAmount,
} from './types';
import { BONUS_DOC_LABELS, isSalesBase, PRICE_GROUP_LABELS } from './types';

const round2 = (value: number) => Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;

/** True when `date` is inside `[validFrom, validTo]` (open end when `validTo` is null). */
export function isValidOn(rule: { validFrom: string; validTo: string | null }, date: string): boolean {
  return rule.validFrom <= date && (!rule.validTo || date <= rule.validTo);
}

const matches = (rule: string, value: string) => rule === '*' || rule.trim().toUpperCase() === value.trim().toUpperCase();

/**
 * Most specific rate for a line on its cash date: a per-product rate first, then the rate matching
 * the most of brand / family / price group ('*' matches anything). Ties go to the newest `validFrom`.
 */
export function pickRate(rates: readonly CommissionRate[], line: Pick<LedgerLine, 'productId' | 'brand' | 'family' | 'cashDate'> & { pricelistId?: number | null }, group: PriceGroup | null): CommissionRate | null {
  let best: { rate: CommissionRate; score: number } | null = null;
  for (const rate of rates) {
    if (!isValidOn(rate, line.cashDate)) continue;
    const pricelistId = rate.odooPricelistId ?? null;
    if (pricelistId !== null && pricelistId !== (line.pricelistId ?? null)) continue;
    if (rate.priceGroup !== '*' && rate.priceGroup !== group) continue;
    // A pricelist beats a price group, which beats any; a product beats everything.
    const priceScore = pricelistId !== null ? 10 : rate.priceGroup !== '*' ? 1 : 0;
    let score: number;
    if (rate.odooProductId !== null) {
      if (rate.odooProductId !== line.productId) continue;
      score = 100 + priceScore;
    } else {
      if (!matches(rate.brand, line.brand) || !matches(rate.family, line.family)) continue;
      score = (rate.brand !== '*' ? 1 : 0) + (rate.family !== '*' ? 1 : 0) + priceScore;
    }
    if (!best || score > best.score || (score === best.score && rate.validFrom > best.rate.validFrom)) best = { rate, score };
  }
  return best?.rate ?? null;
}

/** Pay-out % for `days` after the due date on `date`; 0 when no step covers it (beyond the last step). */
export function pickStepPercent(steps: readonly OverdueStep[], days: number, date: string): number {
  if (!stepsInForce(steps, date)) return NO_STEPS_PERCENT;
  return pickStep(steps, days, date)?.percent ?? 0;
}

/** Paid when no overdue step is set up for the cash date: the full commission. */
export const NO_STEPS_PERCENT = 100;

/** True when at least one overdue step is in force on `date` (otherwise every line gets 100%). */
export const stepsInForce = (steps: readonly OverdueStep[], date: string): boolean => steps.some((s) => isValidOn(s, date));

/** The step covering `days` after the due date on `date`, or null (beyond the last step / none in force). */
export function pickStep(steps: readonly OverdueStep[], days: number, date: string): OverdueStep | null {
  const valid = steps.filter((s) => isValidOn(s, date) && s.minDays <= days && (s.maxDays === null || days <= s.maxDays));
  valid.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return valid[0] ?? null;
}

/** "0–10 วัน", "121 วันขึ้นไป"; null = no step covered the days. */
export function stepRangeLabel(step: Pick<OverdueStep, 'minDays' | 'maxDays'> | null): string {
  if (!step) return 'เกินขั้นสุดท้าย / ไม่มีขั้นบันได';
  return step.maxDays === null ? `${step.minDays} วันขึ้นไป` : `${step.minDays}–${step.maxDays} วัน`;
}

/** Problems in a set of steps valid on the same day: overlapping ranges or gaps between them. */
export function stepProblems(steps: readonly Pick<OverdueStep, 'minDays' | 'maxDays'>[]): string[] {
  const sorted = [...steps].sort((a, b) => a.minDays - b.minDays);
  const problems: string[] = [];
  if (sorted.length && sorted[0].minDays !== 0) problems.push(`ขั้นแรกควรเริ่มที่ 0 วัน (ตอนนี้เริ่ม ${sorted[0].minDays})`);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.maxDays === null || cur.minDays <= prev.maxDays) problems.push(`ช่วง ${prev.minDays}–${prev.maxDays ?? '∞'} ซ้อนกับ ${cur.minDays}–${cur.maxDays ?? '∞'} วัน`);
    else if (cur.minDays > prev.maxDays + 1) problems.push(`ไม่มีขั้นสำหรับ ${prev.maxDays + 1}–${cur.minDays - 1} วัน (จะได้ 0%)`);
  }
  return problems;
}

/** Short description of a rate for the result table, e.g. "0.9%" or "฿15/หน่วย". */
export function rateLabel(rate: Pick<CommissionRate, 'kind' | 'value'>): string {
  return rate.kind === 'PERCENT' ? `${rate.value}%` : `฿${rate.value}/หน่วย`;
}

export type CalcInput = {
  lines: readonly LedgerLine[];
  rates: readonly CommissionRate[];
  steps: readonly OverdueStep[];
  pricelists: readonly CommissionPricelist[];
  targets: readonly CommissionTarget[];
  adjustments: readonly Pick<CommissionAdjustment, 'odooUserId' | 'amount'>[];
  reps: readonly Pick<CommissionRep, 'odooUserId' | 'name'>[];
  /** Reps switched off for commission: their lines are reported but paid to nobody. */
  inactive?: ReadonlySet<number>;
  /** Negative balances carried from the previous run, by Odoo user id. */
  carryIn: ReadonlyMap<number, number>;
  period: string;
  /** Statement rows and deductions; defaults to the client's sheet rows with no deductions. */
  statement?: StatementSettings;
  /** Overdue-invoice holds; those held or given back in `period` count. */
  holds?: readonly Pick<DebtHold, 'odooUserId' | 'amount' | 'heldPeriod' | 'releasedPeriod' | 'invoiceName'>[];
  /** Credit notes and customer refunds of the period: shown with the results, never deducted. */
  credits?: readonly CreditNote[];
  refunds?: { count: number; amount: number };
  /** Sales-bonus ladder and new-customer amount; none when missing. */
  bonus?: BonusSettings;
  /** How the target turns into commission; GATE when missing. */
  target?: TargetSettings;
  /** Rep salaries; with a salary ladder the bonus is tier salary − the rep's salary of `period`. */
  salaries?: readonly Pick<CommissionSalary, 'odooUserId' | 'period' | 'amount'>[];
  /** Sales documents of the period (invoices or sale orders): the ladder base when `bonus.bonusBase` is one of them. */
  saleOrders?: readonly Pick<SaleOrder, 'odooUserId' | 'repName' | 'amountUntaxed' | 'period'>[];
  /** New customers counted in the period (those of other periods are ignored). */
  newCustomers?: readonly Pick<NewCustomer, 'odooUserId' | 'repName' | 'partnerName' | 'invoiceName' | 'period'>[];
};

/** Why a collected line earned no commission, or null when it earned some (before the target gate). */
export function excludedReasonOf(line: Pick<LedgerLine, 'productId'>, result: Pick<LineResult, 'rateId' | 'stepPercent'> | undefined): ExcludedReason | null {
  if (line.productId === null) return 'NO_PRODUCT';
  if (!result?.rateId) return 'NO_RATE';
  return result.stepPercent === 0 ? 'OVERDUE' : null;
}

/** Commission of one line; returns the rule pieces so the screen can explain the figure. */
export function lineCommission(line: LedgerLine, input: Pick<CalcInput, 'rates' | 'steps'>, pricelist: CommissionPricelist | undefined): LineResult & { issue?: string } {
  const empty = { lineKey: line.lineKey, odooUserId: line.odooUserId, rateId: null, rateLabel: '—', specialPercent: 100, stepPercent: 0, commission: 0 };
  if (line.productId === null) return empty;
  const group = pricelist?.priceGroup ?? null;
  const rate = pickRate(input.rates, line, group);
  const specialPercent = pricelist?.isSpecial ? pricelist.specialPercent : 100;
  // No overdue steps set up for the cash date: pay 100%; beyond the last step of a set-up ladder: 0%.
  const noSteps = !stepsInForce(input.steps, line.cashDate);
  const step = noSteps ? null : pickStep(input.steps, line.overdueDays ?? 0, line.cashDate);
  const stepPercent = noSteps ? NO_STEPS_PERCENT : step?.percent ?? 0;
  const stepRange = step ? { minDays: step.minDays, maxDays: step.maxDays } : null;
  if (!rate) {
    const where = [line.brand || 'ไม่มียี่ห้อ', line.family || 'ไม่มีกลุ่ม', `${line.pricelistName ?? 'ไม่มี pricelist'} (${group ? PRICE_GROUP_LABELS[group] : 'pricelist ยังไม่จัดกลุ่ม'})`].join(' / ');
    // A rate that would match but starts after the cash date is the usual set-up slip: say so.
    const undated = pickRate(input.rates.filter((r) => r.validFrom > line.cashDate).map((r) => ({ ...r, validFrom: '0000-01-01', validTo: null })), line, group);
    const later = undated && input.rates.find((r) => r.id === undated.id);
    const hint = later ? ` (มีอัตราแต่เริ่มใช้ ${later.validFrom} หลังวันเงินเข้า ${line.cashDate})` : '';
    return { ...empty, specialPercent, stepPercent, issue: `ไม่มีอัตราค่าคอมสำหรับ ${where}${hint}` };
  }
  const basic = rate.kind === 'PERCENT' ? (line.base * rate.value) / 100 : line.qty * rate.value;
  const beforeStep = (basic * specialPercent) / 100;
  const result = {
    lineKey: line.lineKey, odooUserId: line.odooUserId, rateId: rate.id, rateLabel: rateLabel(rate), specialPercent, stepPercent,
    commission: (beforeStep * stepPercent) / 100, beforeStep, stepRange, ...(noSteps ? { noSteps: true } : {}),
  };
  return result;
}

/**
 * Calculates a whole run. Lines without a rep are reported but paid to nobody. A rep with no
 * target (blank or 0) has no gate and is paid in full, as before targets existed.
 * The target mode (`target.ts`) sets the % of this period's commission paid: GATE pays all or
 * nothing, EXCESS the share above the target, PROPORTIONAL up to 100%, LADDER by % of target steps.
 * Corrections of earlier periods (RETRO) are not scaled; at 0% only the negative ones still count. Then, per rep, as on the client's statement sheet:
 *   รวม = commission per statement row + holds given back this period
 *   − central fund % of รวม − overdue-invoice holds taken this period + adjustments + carried balance.
 * A negative result is not paid and carries forward. The sales bonus of the tier the rep's collections
 * reach and the new-customer bonus are added after the deductions, and only when the target is met.
 */
export function calculateRun(input: CalcInput): RunResults {
  const statement = input.statement ?? statementSettings({ centralPercent: 0, debtPercent: 0 });
  const pricelists = new Map(input.pricelists.map((p) => [p.odooPricelistId, p]));
  const targetRule = input.target ?? targetSettings({});
  const targets = new Map(input.targets.filter((t) => t.period === input.period).map((t) => [t.odooUserId, t.amount]));
  const names = new Map(input.reps.map((r) => [r.odooUserId, r.name]));
  const issues: RunResults['issues'] = [];
  const lines: LineResult[] = [];
  /** Per statement row: commission of normal lines, of all RETRO lines, of negative RETRO lines. */
  type Bucket = { normal: number; retro: number; retroNegative: number; base: number; rates: Set<string> };
  type Acc = {
    name: string; base: number; gross: number; lines: number; buckets: Map<string, Bucket>; held: number; released: number;
    counted: number; before: number; excluded: Map<ExcludedReason, ExcludedAmount>; creditBase: number; credits: number; steps: Map<string, StepAmount>;
  };
  const acc = new Map<number, Acc>();
  const accFor = (id: number, name: string | null) => {
    let a = acc.get(id);
    if (!a) {
      a = { name: names.get(id) ?? name ?? `Odoo user #${id}`, base: 0, gross: 0, lines: 0, buckets: new Map(), held: 0, released: 0, counted: 0, before: 0, excluded: new Map(), creditBase: 0, credits: 0, steps: new Map() };
      acc.set(id, a);
    }
    return a;
  };
  // An unmapped pricelist only matters when no rate or statement row names it directly.
  const named = new Set([...input.rates.map((r) => r.odooPricelistId), ...statement.summaryLines.map((r) => r.pricelistId)].filter((id): id is number => id != null));
  const unmapped = new Set<string>();
  let unassignedBase = 0;
  let notInvoiceGross = 0;

  for (const line of input.lines) {
    const pricelist = line.pricelistId !== null ? pricelists.get(line.pricelistId) : undefined;
    if (line.pricelistId !== null && !pricelist && !named.has(line.pricelistId)) unmapped.add(line.pricelistName ?? `#${line.pricelistId}`);
    const { issue, ...result } = lineCommission(line, input, pricelist);
    const lineResult: LineResult = { ...result, summaryKey: summaryKeyOf(statement.summaryLines, { family: line.family, paymentKind: line.paymentKind ?? 'CREDIT', pricelistId: line.pricelistId }, pricelist?.priceGroup ?? null) };
    lines.push(lineResult);
    if (issue) issues.push({ lineKey: line.lineKey, message: issue });
    for (const message of line.issues) issues.push({ lineKey: line.lineKey, message });
    if (line.odooUserId === null || input.inactive?.has(line.odooUserId)) {
      unassignedBase += line.base;
      if (line.invoiceId === null) notInvoiceGross += line.gross;
      continue;
    }
    const a = accFor(line.odooUserId, line.repName);
    a.base += line.base;
    a.gross += line.gross;
    a.lines += 1;
    // What the money earned, or why it earned nothing, so the screen needs no cross-checking.
    const reason = excludedReasonOf(line, lineResult);
    if (reason) {
      const e = a.excluded.get(reason) ?? { reason, base: 0, lines: 0 };
      e.base += line.base;
      e.lines += 1;
      a.excluded.set(reason, e);
    } else a.counted += line.base;
    a.before += lineResult.commission;
    if (lineResult.rateId) {
      const range = lineResult.stepRange ?? null;
      const key = lineResult.noSteps ? 'no-steps' : range ? `${range.minDays}-${range.maxDays ?? ''}` : 'none';
      const st = a.steps.get(key) ?? { minDays: range?.minDays ?? null, maxDays: range?.maxDays ?? null, percent: lineResult.stepPercent, base: 0, lines: 0, beforeStep: 0, commission: 0, ...(lineResult.noSteps ? { noSteps: true } : {}) };
      st.base += line.base;
      st.lines += 1;
      st.beforeStep += lineResult.beforeStep ?? 0;
      st.commission += lineResult.commission;
      a.steps.set(key, st);
    }
    const bucket = a.buckets.get(lineResult.summaryKey!) ?? { normal: 0, retro: 0, retroNegative: 0, base: 0, rates: new Set<string>() };
    bucket.base += line.base;
    if (lineResult.rateId) bucket.rates.add(lineResult.rateLabel);
    if (line.kind === 'RETRO') {
      bucket.retro += lineResult.commission;
      if (lineResult.commission < 0) bucket.retroNegative += lineResult.commission;
    } else bucket.normal += lineResult.commission;
    a.buckets.set(lineResult.summaryKey!, bucket);
  }
  for (const name of unmapped) issues.push({ message: `pricelist "${name}" ยังไม่ได้จัดกลุ่ม (ปลีก/ส่ง) จึงใช้ได้เฉพาะอัตราที่ตั้งราย pricelist หรือกลุ่มราคาเป็น "ทุกกลุ่ม"` });

  for (const hold of input.holds ?? []) {
    const taken = hold.heldPeriod === input.period;
    const givenBack = hold.releasedPeriod === input.period;
    if (!taken && !givenBack) continue;
    if (hold.odooUserId === null) {
      if (taken) issues.push({ message: `ลูกหนี้ค้างชำระ ${hold.invoiceName} ไม่มีพนักงานขาย จึงไม่ได้หักใคร` });
      continue;
    }
    if (input.inactive?.has(hold.odooUserId)) continue;
    const a = accFor(hold.odooUserId, null);
    if (taken) a.held += hold.amount;
    if (givenBack) a.released += hold.amount;
  }

  for (const note of input.credits ?? []) {
    if (note.odooUserId === null || input.inactive?.has(note.odooUserId)) continue;
    const a = accFor(note.odooUserId, note.repName);
    a.creditBase += note.base;
    a.credits += 1;
  }

  const newByRep = new Map<number, { partnerName: string; invoiceName: string }[]>();
  for (const c of input.newCustomers ?? []) {
    if (c.period !== input.period) continue;
    if (c.odooUserId === null) {
      issues.push({ message: `ลูกค้าใหม่ ${c.partnerName} (${c.invoiceName}) ไม่มีพนักงานขาย จึงไม่ได้ให้ใคร` });
      continue;
    }
    if (input.inactive?.has(c.odooUserId)) continue;
    accFor(c.odooUserId, c.repName);
    newByRep.set(c.odooUserId, [...(newByRep.get(c.odooUserId) ?? []), { partnerName: c.partnerName, invoiceName: c.invoiceName }]);
  }
  const tiers = input.bonus?.bonusTiers ?? [];
  const bySalary = paysBySalary(tiers);
  const salaries = new Map((input.salaries ?? []).filter((x) => x.period === input.period).map((x) => [x.odooUserId, x.amount]));
  const perCustomer = input.bonus?.newCustomerBonus ?? 0;
  // Incentive on sale orders: the ladder is measured on each rep's confirmed orders, no target gate.
  const onOrders = isSalesBase(input.bonus?.bonusBase);
  const orders = new Map<number, { base: number; count: number }>();
  if (onOrders) {
    let noRep = 0;
    for (const o of input.saleOrders ?? []) {
      if (o.period !== input.period) continue;
      if (o.odooUserId === null) { noRep += o.amountUntaxed; continue; }
      if (input.inactive?.has(o.odooUserId)) continue;
      accFor(o.odooUserId, o.repName);
      const t = orders.get(o.odooUserId) ?? { base: 0, count: 0 };
      t.base += o.amountUntaxed;
      t.count += 1;
      orders.set(o.odooUserId, t);
    }
    if (noRep) issues.push({ message: `${BONUS_DOC_LABELS[input.bonus!.bonusBase]}ไม่มีพนักงานขาย ยอด ${round2(noRep).toLocaleString('th-TH')} บาท จึงไม่นับ incentive ให้ใคร` });
  }

  const adjustments = new Map<number, number>();
  for (const adj of input.adjustments) adjustments.set(adj.odooUserId, (adjustments.get(adj.odooUserId) ?? 0) + adj.amount);
  for (const id of [...adjustments.keys(), ...input.carryIn.keys()]) accFor(id, null);
  const rows = [...statement.summaryLines, OTHER_SUMMARY];

  const reps: RepResult[] = [...acc.entries()].map(([odooUserId, a]) => {
    const target = targets.has(odooUserId) ? targets.get(odooUserId)! : null;
    const base = round2(a.base);
    const targetMet = target === null || target === 0 || base >= target;
    // Share of this period's commission the target lets through (100% without a target).
    const payPercent = target === null ? 100 : targetPayPercent(targetRule, base, target);
    const summary = rows.map((row) => {
      const b = a.buckets.get(row.key);
      return { key: row.key, label: row.label, amount: b ? round2(payPercent > 0 ? (b.normal * payPercent) / 100 + b.retro : b.retroNegative) : 0, base: round2(b?.base ?? 0), rates: [...(b?.rates ?? [])] };
    }).filter((s) => s.key !== OTHER_SUMMARY.key || s.amount !== 0);
    const commission = round2(summary.reduce((s, r) => s + r.amount, 0));
    const debtRelease = round2(a.released);
    const subtotal = round2(commission + debtRelease);
    const central = round2((Math.max(0, subtotal) * statement.centralPercent) / 100);
    const debtHold = round2(a.held);
    const adj = round2(adjustments.get(odooUserId) ?? 0);
    const carryIn = round2(Math.min(0, input.carryIn.get(odooUserId) ?? 0));
    const ordersOf = orders.get(odooUserId);
    const saleOrderBase = round2(ordersOf?.base ?? 0);
    const tier = pickTier(tiers, onOrders ? saleOrderBase : base);
    // On sale orders the incentive needs no target; on collections only when the target is met (as before).
    const bonusAllowed = onOrders || targetMet;
    const salary = bySalary ? salaries.get(odooUserId) ?? null : undefined;
    if (tier && salary === null && bonusAllowed) issues.push({ message: `ยังไม่ได้ตั้งเงินเดือนของ ${a.name} รอบนี้ จึงยังคิดเงินพิเศษขั้น ${tier.index} ไม่ได้ (ตั้งที่หน้าเป้า)` });
    const tierBonus = bonusAllowed && tier ? round2(tierBonusAmount(tier, bySalary, salary ?? null)) : 0;
    const newCustomers = newByRep.get(odooUserId) ?? [];
    const newCustomerBonus = targetMet ? round2(newCustomers.length * perCustomer) : 0;
    const total = round2(subtotal - central - debtHold + tierBonus + newCustomerBonus + adj + carryIn);
    return {
      odooUserId, repName: a.name, base, gross: round2(a.gross), lines: a.lines, target, targetMet: target !== null && targetMet, commission,
      targetMode: targetRule.targetMode, targetPercent: achievementPercent(base, target) === null ? null : round2(achievementPercent(base, target)!), targetPayPercent: round2(payPercent),
      counted: round2(a.counted), excluded: [...a.excluded.values()].map((e) => ({ ...e, base: round2(e.base) })), commissionBeforeTarget: round2(a.before),
      creditNoteBase: round2(a.creditBase), creditNoteCount: a.credits,
      steps: [...a.steps.values()].sort((x, y) => (x.minDays ?? Infinity) - (y.minDays ?? Infinity))
        .map((st) => ({ ...st, base: round2(st.base), beforeStep: round2(st.beforeStep), commission: round2(st.commission) })),
      summary, debtRelease, subtotal, centralPercent: statement.centralPercent, central, debtHold,
      adjustments: adj, carryIn, tierBonus, tier: tier ? { index: tier.index, minAmount: tier.minAmount, ...(bySalary ? { salary: tier.salary ?? 0 } : {}) } : null, ...(salary !== undefined ? { salary } : {}),
      ...(onOrders ? { bonusBase: input.bonus!.bonusBase, saleOrderBase, saleOrderCount: ordersOf?.count ?? 0 } : {}), newCustomers, newCustomerBonus,
      payable: Math.max(0, total), carryOut: Math.min(0, total),
    };
  }).sort((x, y) => y.payable - x.payable || x.repName.localeCompare(y.repName));

  return {
    reps, lines, issues, unassignedBase: round2(unassignedBase), notInvoiceGross: round2(notInvoiceGross),
    credits: input.credits ? [...input.credits] : undefined, refunds: input.refunds,
    totalPayable: round2(reps.reduce((s, r) => s + r.payable, 0)),
  };
}

/** Issues that stop a run from being submitted: reps without a salary when it is needed for the bonus. Others are warnings. */
export function blockingIssues(results: RunResults): string[] {
  return results.issues.filter((i) => i.message.startsWith('ยังไม่ได้ตั้งเงินเดือน')).map((i) => i.message);
}
