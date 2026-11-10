'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { requirePermission } from '@/lib/auth/session';
import { flash } from '@/lib/flash';
import { bonusSettings, JFC_2569_TIERS, normalizeTiers } from '@/lib/commission/bonus';
import { isValidOn, rateLabel, stepProblems } from '@/lib/commission/calc';
import { fetchPricelists } from '@/lib/commission/odoo';
import { endDateProblem, isIsoDate, isPeriod, periodDates, shiftPeriod, thaiDay, todayBangkok } from '@/lib/commission/period';
import { statementSettings } from '@/lib/commission/statement';
import * as repo from '@/lib/commission/repo';
import * as service from '@/lib/commission/service';
import { normalizeTargetSteps, targetSettings } from '@/lib/commission/target-mode';
import { parseTargetLines } from '@/lib/commission/targets';
import { TARGET_MODES, type BonusBase, type BonusTier, type CommissionSource, type PriceGroup, type SummaryLine, type TargetMode, type TargetStep } from '@/lib/commission/types';
import { probeOdooConnection } from '@/lib/odoo/rpc';
import { decryptSecret, encryptSecret } from '@/lib/settings/crypto';

const BASE = '/admin/commission';
const PRICE_GROUPS = ['RETAIL', 'WHOLESALE', 'OTHER'] as const;

/** Field value as a trimmed string ('' when missing). */
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

/** Number from a form field with thousands separators removed; NaN when blank or invalid. */
const numberField = (formData: FormData, name: string) => {
  const text = field(formData, name).replace(/,/g, '');
  return text ? Number(text) : Number.NaN;
};

/** Back to `path` keeping the chosen company and period, plus a message. */
function back(path: string, formData: FormData, extra: Record<string, string> = {}): never {
  const sp = new URLSearchParams();
  for (const key of ['source', 'period']) if (field(formData, key)) sp.set(key, field(formData, key));
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const q = sp.toString();
  redirect(q ? `${path}?${q}` : path);
}

const fail = (path: string, formData: FormData, message: string): never => back(path, formData, { error: message });

/** The company named in the form, or back with an error. */
async function sourceOf(path: string, formData: FormData): Promise<CommissionSource> {
  const source = await repo.getSource(field(formData, 'source'));
  if (!source) fail(path, formData, 'ไม่พบบริษัท เลือกบริษัทก่อน');
  return source!;
}

function periodOf(path: string, formData: FormData): string {
  const period = field(formData, 'period');
  if (!isPeriod(period)) fail(path, formData, 'รอบไม่ถูกต้อง');
  return period;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ');

// ---------- companies ----------

const sourceSchema = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อบริษัท').max(120),
  url: z.string().trim().url('URL ไม่ถูกต้อง').refine((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u), 'URL ต้องขึ้นต้นด้วย https://').transform((u) => u.replace(/\/+$/, '')),
  db: z.string().trim().min(1, 'กรอกชื่อฐานข้อมูล').max(120),
  username: z.string().trim().min(1, 'กรอกผู้ใช้ Odoo').max(254),
  apiKey: z.string().trim().max(200),
  cutoffDay: z.coerce.number().int().min(1, 'วันตัดรอบ 1–28').max(28, 'วันตัดรอบ 1–28'),
  payDay: z.coerce.number().int().min(0, 'วันจ่าย 1–31 หรือสิ้นเดือน').max(31, 'วันจ่าย 1–31 หรือสิ้นเดือน'),
  payMonths: z.coerce.number().int().min(0, 'จ่ายหลังสิ้นรอบ 0–6 เดือน').max(6, 'จ่ายหลังสิ้นรอบ 0–6 เดือน'),
  active: z.boolean(),
});

/**
 * Adds or edits a company's Odoo connection. The credentials are tried first (authenticate + version),
 * so a broken connection is never saved; the API key is stored encrypted and only its last 4 characters
 * reach the audit log. A blank key keeps the saved one.
 */
export async function saveSourceAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/sources`;
  const id = field(formData, 'id');
  const parsed = sourceSchema.safeParse({
    name: field(formData, 'name'), url: field(formData, 'url'), db: field(formData, 'db'), username: field(formData, 'username'),
    apiKey: field(formData, 'apiKey'), active: formData.get('active') === 'on',
    // The period rule is set on the "ตั้งค่ารอบ / การจ่าย" tab; a new company starts with 20 / month end next month.
    cutoffDay: '20', payDay: '0', payMonths: '1',
  });
  if (!parsed.success) fail(path, formData, parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const existing = id ? await repo.getSource(id) : null;
  const input = existing ? { ...parsed.data!, cutoffDay: existing.cutoffDay, payDay: existing.payDay, payMonths: existing.payMonths } : parsed.data!;
  if (id && !existing) fail(path, formData, 'ไม่พบบริษัท');
  let apiKey = input.apiKey;
  if (!apiKey && existing) {
    try {
      apiKey = decryptSecret(existing.apiKeyEnc);
    } catch {
      fail(path, formData, 'ถอดรหัส API key เดิมไม่ได้ กรอก API key ใหม่');
    }
  }
  if (!apiKey) fail(path, formData, 'กรอก API key');
  let probe: Awaited<ReturnType<typeof probeOdooConnection>>;
  try {
    probe = await probeOdooConnection({ url: input.url, db: input.db, username: input.username, apiKey });
  } catch (error) {
    fail(path, formData, `เชื่อมต่อไม่สำเร็จ ยังไม่บันทึก: ${errorText(error)}`);
  }
  const row = { name: input.name, url: input.url, db: input.db, username: input.username, apiKeyEnc: encryptSecret(apiKey), cutoffDay: input.cutoffDay, payDay: input.payDay, payMonths: input.payMonths, active: input.active };
  const sourceId = existing ? existing.id : await repo.createSource(row);
  if (existing) await repo.updateSource(existing.id, row);
  service.forgetClient(sourceId);
  await audit(actor.id, existing ? 'commission.source.update' : 'commission.source.create', 'CommissionSource', sourceId, {
    name: input.name, url: input.url, db: input.db, username: input.username, apiKeyLast4: apiKey.slice(-4), apiKeyChanged: Boolean(input.apiKey),
    cutoffDay: input.cutoffDay, payDay: input.payDay, payMonths: input.payMonths, active: input.active, odooUid: probe!.uid, serverVersion: probe!.serverVersion,
  });
  revalidatePath(BASE, 'layout');
  await flash('บันทึกบริษัทแล้ว', { icon: 'sync', description: `${input.name} · Odoo ${probe!.serverVersion}` });
  redirect(`${path}?source=${sourceId}&saved=1`);
}

// ---------- reps ----------

/**
 * Pulls the reps from Odoo: customer tags "Sale …" (the real salespeople) plus internal users without
 * a matching tag (used when a customer has no tag). New ones are added and names refreshed; a user rep
 * that now matches a tag is turned off and its web login moved to the tag rep.
 */
export async function syncRepsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/reps`;
  const source = await sourceOf(path, formData);
  let result = { added: 0, merged: 0 };
  try {
    result = await service.syncReps(source);
  } catch (error) {
    fail(path, formData, `ดึงพนักงานขายจาก Odoo ไม่สำเร็จ: ${errorText(error)}`);
  }
  await audit(actor.id, 'commission.reps.sync', 'CommissionSource', source.id, result);
  revalidatePath(path);
  back(path, formData, { saved: `ดึงพนักงานขายแล้ว เพิ่มใหม่ ${result.added} คน${result.merged ? ` · ย้ายไปใช้ tag Sale ${result.merged} คน` : ''}` });
}

/** Links a rep to a web login and turns them on/off. */
export async function updateRepAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/reps`;
  const source = await sourceOf(path, formData);
  const id = field(formData, 'id');
  const userId = field(formData, 'userId') || null;
  const active = formData.get('active') === 'on';
  await repo.updateRep(id, source.id, { userId, active });
  await audit(actor.id, 'commission.rep.update', 'CommissionRep', id, { userId, active });
  revalidatePath(path);
  back(path, formData, { saved: '1' });
}

// ---------- pricelists ----------

/** Pulls the company's pricelists (new ones start as "อื่นๆ"). */
export async function syncPricelistsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/pricelists`;
  const source = await sourceOf(path, formData);
  let added = 0;
  try {
    added = await repo.upsertPricelists(source.id, await fetchPricelists(service.clientFor(source)));
  } catch (error) {
    fail(path, formData, `ดึง pricelist จาก Odoo ไม่สำเร็จ: ${errorText(error)}`);
  }
  await audit(actor.id, 'commission.pricelists.sync', 'CommissionSource', source.id, { added });
  revalidatePath(path);
  back(path, formData, { saved: `ดึง pricelist แล้ว เพิ่มใหม่ ${added} รายการ` });
}

/** Saves group / special flag / special % of every pricelist row on the page. */
export async function savePricelistsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/pricelists`;
  const source = await sourceOf(path, formData);
  const rows = await repo.listPricelists(source.id);
  const changes: Record<string, unknown> = {};
  for (const row of rows) {
    const group = field(formData, `group_${row.id}`);
    if (!group) continue;
    if (!PRICE_GROUPS.includes(group as PriceGroup)) fail(path, formData, `กลุ่มราคาของ ${row.name} ไม่ถูกต้อง`);
    const isSpecial = formData.get(`special_${row.id}`) === 'on';
    const pct = numberField(formData, `pct_${row.id}`);
    const specialPercent = Number.isFinite(pct) ? pct : row.specialPercent;
    if (specialPercent < 0 || specialPercent > 100) fail(path, formData, `% ราคาพิเศษของ ${row.name} ต้องอยู่ระหว่าง 0–100`);
    if (row.priceGroup === group && row.isSpecial === isSpecial && row.specialPercent === specialPercent) continue;
    await repo.updatePricelist(row.id, source.id, { priceGroup: group as PriceGroup, isSpecial, specialPercent });
    changes[row.name] = { group, isSpecial, specialPercent };
  }
  await audit(actor.id, 'commission.pricelists.save', 'CommissionSource', source.id, { changes });
  revalidatePath(path);
  back(path, formData, { saved: `บันทึก ${Object.keys(changes).length} รายการ` });
}

// ---------- rates ----------

const rateSchema = z.object({
  brand: z.string().trim().max(40).transform((v) => v.toUpperCase() || '*'),
  family: z.string().trim().max(40).transform((v) => v.toUpperCase() || '*'),
  priceGroup: z.enum(['*', 'RETAIL', 'WHOLESALE', 'OTHER']),
  odooPricelistId: z.number().int().positive().nullable(),
  pricelistName: z.string().trim().max(200).nullable(),
  odooProductId: z.number().int().positive().nullable(),
  productName: z.string().trim().max(200).nullable(),
  kind: z.enum(['PERCENT', 'PER_UNIT']),
  value: z.number().finite().min(0, 'อัตราต้องไม่ติดลบ'),
  validFrom: z.string().refine(isIsoDate, 'วันที่เริ่มไม่ถูกต้อง'),
  validTo: z.string().refine(isIsoDate, 'วันที่สิ้นสุดไม่ถูกต้อง').nullable(),
  note: z.string().trim().max(200).nullable(),
}).refine((r) => r.kind !== 'PERCENT' || r.value <= 100, 'อัตรา % ต้องไม่เกิน 100').refine((r) => !r.validTo || r.validTo >= r.validFrom, 'วันที่สิ้นสุดต้องไม่ก่อนวันเริ่ม');

/** Adds a rate (brand × family × price group, or one product). */
export async function createRateAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/rates`;
  const source = await sourceOf(path, formData);
  const productId = Number(field(formData, 'odooProductId'));
  // The price field is '*', a price group, or `pl:<id>|<name>` for one Odoo pricelist.
  const price = field(formData, 'priceGroup') || '*';
  const pricelist = /^pl:(\d+)\|([^]*)$/.exec(price);
  // One Odoo product category ("AT-PCR" → brand AT, family PCR) as `brand|family`, '*' = any; else the two text fields.
  const category = formData.has('category') ? field(formData, 'category').split('|') : null;
  const anyOf = (v: string | undefined) => (!v || v === '*' ? '' : v);
  const parsed = rateSchema.safeParse({
    brand: category ? anyOf(category[0]) : field(formData, 'brand'), family: category ? anyOf(category[1]) : field(formData, 'family'), priceGroup: pricelist ? '*' : price,
    odooPricelistId: pricelist ? Number(pricelist[1]) : null, pricelistName: pricelist ? pricelist[2] || null : null,
    odooProductId: Number.isInteger(productId) && productId > 0 ? productId : null, productName: field(formData, 'productName') || null,
    kind: field(formData, 'kind'), value: numberField(formData, 'value'), validFrom: field(formData, 'validFrom'), validTo: field(formData, 'validTo') || null, note: field(formData, 'note') || null,
  });
  if (!parsed.success) fail(path, formData, parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const rate = parsed.data!;
  await repo.createRate({ sourceId: source.id, ...rate, brand: rate.odooProductId ? '*' : rate.brand, family: rate.odooProductId ? '*' : rate.family }, actor.id);
  await audit(actor.id, 'commission.rate.create', 'CommissionSource', source.id, rate);
  revalidatePath(path);
  back(path, formData, { saved: '1' });
}

/** Ends a rate on a date (the usual way to change a rule) or deletes it. */
export async function endOrDeleteRateAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/rates`;
  const source = await sourceOf(path, formData);
  const id = field(formData, 'id');
  if (field(formData, 'delete') === '1') {
    await repo.deleteRate(id, source.id);
    await audit(actor.id, 'commission.rate.delete', 'CommissionRate', id);
  } else {
    const validTo = field(formData, 'validTo');
    if (!isIsoDate(validTo)) fail(path, formData, 'เลือกวันที่สิ้นสุด');
    await repo.endRate(id, source.id, validTo);
    await audit(actor.id, 'commission.rate.end', 'CommissionRate', id, { validTo });
  }
  revalidatePath(path);
  back(path, formData, { saved: '1' });
}

/**
 * Fills a company that has no rules yet with the client's starting rules: Austone PCR/TBR retail and
 * wholesale rates and the 0-10 / 11-15 / 16-20 day steps (110% / 100% / 90%). Everything stays editable.
 */
export async function seedDefaultsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/rates`;
  const source = await sourceOf(path, formData);
  const validFrom = field(formData, 'validFrom');
  if (!isIsoDate(validFrom)) fail(path, formData, 'เลือกวันที่เริ่มใช้');
  const [rates, steps] = await Promise.all([repo.listRates(source.id), repo.listSteps(source.id)]);
  const brand = field(formData, 'brand').toUpperCase() || 'AT';
  let added = 0;
  if (!rates.length) {
    const defaults: [string, PriceGroup, number][] = [['PCR', 'RETAIL', 0.9], ['PCR', 'WHOLESALE', 0.4], ['TBR', 'RETAIL', 0.6], ['TBR', 'WHOLESALE', 0.3]];
    for (const [family, priceGroup, value] of defaults) {
      await repo.createRate({ sourceId: source.id, brand, family, priceGroup, odooPricelistId: null, pricelistName: null, odooProductId: null, productName: null, kind: 'PERCENT', value, validFrom, validTo: null, note: 'ค่าเริ่มต้นตามเงื่อนไขลูกค้า' }, actor.id);
      added += 1;
    }
  }
  if (!steps.length) {
    for (const [minDays, maxDays, percent] of [[0, 10, 110], [11, 15, 100], [16, 20, 90]] as const) {
      await repo.createStep({ sourceId: source.id, minDays, maxDays, percent, validFrom, validTo: null });
      added += 1;
    }
  }
  await audit(actor.id, 'commission.seed', 'CommissionSource', source.id, { brand, validFrom, added });
  revalidatePath(BASE, 'layout');
  back(path, formData, added ? { saved: `เพิ่มค่าเริ่มต้น ${added} รายการ` } : { error: 'มีอัตราและขั้นบันไดอยู่แล้ว ไม่ได้เพิ่ม' });
}

// ---------- overdue steps ----------

/** Adds a step (days after due date → % paid). Overlaps with steps valid on the same start date are refused. */
export async function createStepAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/steps`;
  const source = await sourceOf(path, formData);
  const minDays = numberField(formData, 'minDays');
  const maxRaw = field(formData, 'maxDays');
  const maxDays = maxRaw ? Number(maxRaw) : null;
  const percent = numberField(formData, 'percent');
  const validFrom = field(formData, 'validFrom');
  const validTo = field(formData, 'validTo') || null;
  if (!Number.isInteger(minDays) || minDays < 0) fail(path, formData, 'จำนวนวันเริ่มต้องเป็นจำนวนเต็ม 0 ขึ้นไป');
  if (maxDays !== null && (!Number.isInteger(maxDays) || maxDays < minDays)) fail(path, formData, 'จำนวนวันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม');
  if (!Number.isFinite(percent) || percent < 0 || percent > 500) fail(path, formData, '% จ่ายต้องอยู่ระหว่าง 0–500');
  if (!isIsoDate(validFrom) || (validTo && (!isIsoDate(validTo) || validTo < validFrom))) fail(path, formData, 'ช่วงวันที่มีผลไม่ถูกต้อง');
  const sameTime = (await repo.listSteps(source.id)).filter((s) => s.validFrom <= validFrom && (!s.validTo || s.validTo >= validFrom));
  const overlap = stepProblems([...sameTime, { minDays, maxDays }]).find((p) => p.includes('ซ้อน'));
  if (overlap) fail(path, formData, `${overlap} (ปิดขั้นเดิมก่อน หรือเริ่มใช้วันอื่น)`);
  await repo.createStep({ sourceId: source.id, minDays, maxDays, percent, validFrom, validTo });
  await audit(actor.id, 'commission.step.create', 'CommissionSource', source.id, { minDays, maxDays, percent, validFrom, validTo });
  revalidatePath(path);
  back(path, formData, { saved: '1' });
}

export async function endOrDeleteStepAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/steps`;
  const source = await sourceOf(path, formData);
  const id = field(formData, 'id');
  if (field(formData, 'delete') === '1') {
    await repo.deleteStep(id, source.id);
    await audit(actor.id, 'commission.step.delete', 'CommissionOverdueStep', id);
  } else {
    const validTo = field(formData, 'validTo');
    if (!isIsoDate(validTo)) fail(path, formData, 'เลือกวันที่สิ้นสุด');
    await repo.endStep(id, source.id, validTo);
    await audit(actor.id, 'commission.step.end', 'CommissionOverdueStep', id, { validTo });
  }
  revalidatePath(path);
  back(path, formData, { saved: '1' });
}

// ---------- targets ----------

/** Refuses target changes for a period whose run is approved. */
async function assertPeriodOpen(path: string, formData: FormData, sourceId: string, period: string) {
  if (service.isLocked(await repo.getRun(sourceId, period))) fail(path, formData, 'รอบนี้อนุมัติแล้ว แก้เป้าไม่ได้');
}

/** Saves the target column of the page: blank clears, 0 means "no gate". */
export async function saveTargetsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/targets`;
  const source = await sourceOf(path, formData);
  const period = periodOf(path, formData);
  await assertPeriodOpen(path, formData, source.id, period);
  // Same rows as the page: tag reps and untagged salespeople keyed like the ledger.
  const { reps } = await service.targetReps(source, period);
  const values = new Map<number, number | null>();
  const salaries = new Map<number, number | null>();
  const amountOf = (name: string, label: string) => {
    const raw = field(formData, name);
    const amount = raw ? Number(raw.replace(/,/g, '')) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) fail(path, formData, `${label} ไม่ถูกต้อง`);
    return amount === null ? null : Math.round(amount * 100) / 100;
  };
  for (const rep of reps) {
    if (formData.has(`t_${rep.odooUserId}`)) values.set(rep.odooUserId, amountOf(`t_${rep.odooUserId}`, `เป้าของ ${rep.name}`));
    if (formData.has(`s_${rep.odooUserId}`)) salaries.set(rep.odooUserId, amountOf(`s_${rep.odooUserId}`, `เงินเดือนของ ${rep.name}`));
  }
  await repo.saveTargets(source.id, period, values, actor.id);
  if (salaries.size) {
    try {
      await repo.saveSalaries(source.id, period, salaries, actor.id);
    } catch (error) {
      fail(path, formData, `บันทึกเป้าแล้ว แต่บันทึกเงินเดือนไม่ได้ (รัน migration 20261110120000_commission_salary.sql แล้วหรือยัง): ${errorText(error)}`);
    }
  }
  await audit(actor.id, 'commission.targets.save', 'CommissionSource', source.id, { period, targets: Object.fromEntries(values), salaries: Object.fromEntries(salaries) });
  revalidatePath(path);
  back(path, formData, { saved: '1' });
}

/** Copies last period's targets and salaries into this period for reps that have none yet. */
export async function copyTargetsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/targets`;
  const source = await sourceOf(path, formData);
  const period = periodOf(path, formData);
  await assertPeriodOpen(path, formData, source.id, period);
  const [previous, current] = await Promise.all([repo.listTargets(source.id, shiftPeriod(period, -1)), repo.listTargets(source.id, period)]);
  const have = new Set(current.map((t) => t.odooUserId));
  const values = new Map(previous.filter((t) => !have.has(t.odooUserId)).map((t) => [t.odooUserId, t.amount] as [number, number]));
  await repo.saveTargets(source.id, period, values, actor.id);
  const [previousSalaries, currentSalaries] = await Promise.all([repo.listSalaries(source.id, shiftPeriod(period, -1)), repo.listSalaries(source.id, period)]);
  const haveSalary = new Set(currentSalaries.map((x) => x.odooUserId));
  const salaries = new Map(previousSalaries.filter((x) => !haveSalary.has(x.odooUserId)).map((x) => [x.odooUserId, x.amount] as [number, number]));
  await repo.saveSalaries(source.id, period, salaries, actor.id);
  await audit(actor.id, 'commission.targets.copy', 'CommissionSource', source.id, { period, count: values.size, salaries: salaries.size });
  revalidatePath(path);
  back(path, formData, { saved: `คัดลอกเป้า ${values.size} คน${salaries.size ? ` และเงินเดือน ${salaries.size} คน` : ''}จากรอบก่อน` });
}

/** Imports targets pasted from Excel: one rep per line, "rep name or rep key <tab/comma> amount". */
export async function importTargetsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/targets`;
  const source = await sourceOf(path, formData);
  const period = periodOf(path, formData);
  await assertPeriodOpen(path, formData, source.id, period);
  // The targets page rows (tag reps first), so a name like "Tip" finds the tag rep, not the switched-off Odoo user rep.
  const { reps } = await service.targetReps(source, period);
  // "Wit" and "Sale Wit" both find the tag rep.
  const result = parseTargetLines(field(formData, 'paste'), [...reps, ...reps.filter((r) => r.tag).map((r) => ({ odooUserId: r.odooUserId, name: `Sale ${r.name}` }))]);
  if (result.errors.length) fail(path, formData, result.errors.slice(0, 3).join(' · '));
  if (!result.values.size) fail(path, formData, 'ไม่มีบรรทัดที่นำเข้าได้');
  await repo.saveTargets(source.id, period, result.values, actor.id);
  await audit(actor.id, 'commission.targets.import', 'CommissionSource', source.id, { period, count: result.values.size });
  revalidatePath(path);
  back(path, formData, { saved: `นำเข้าเป้า ${result.values.size} คน` });
}

// ---------- statement ----------

const MAX_SUMMARY_LINES = 30;

/**
 * Saves the per-rep statement layout of a company: its rows (label + family / price group /
 * cash-credit filter, in order; a blank label drops the row), the central fund % and the overdue
 * invoice hold (days, %). Takes effect at the next calculation; approved runs keep their snapshot.
 */
export async function saveStatementSettingsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/statement`;
  const source = await sourceOf(path, formData);
  const rows: (SummaryLine & { order: number })[] = [];
  for (let i = 0; i < MAX_SUMMARY_LINES; i++) {
    const label = field(formData, `label_${i}`).slice(0, 120);
    if (!label || formData.get(`remove_${i}`) === 'on') continue;
    const family = field(formData, `family_${i}`).toUpperCase().slice(0, 40) || '*';
    // '*', a price group, or `pl:<id>|<name>` for one Odoo pricelist (as on the rates tab).
    const price = field(formData, `group_${i}`) || '*';
    const pricelist = /^pl:(\d+)\|([^]*)$/.exec(price);
    const priceGroup = pricelist ? '*' : price;
    const paymentKind = field(formData, `kind_${i}`) || '*';
    if (!['*', ...PRICE_GROUPS].includes(priceGroup)) fail(path, formData, `กลุ่มราคาของ "${label}" ไม่ถูกต้อง`);
    if (!['*', 'CASH', 'CREDIT'].includes(paymentKind)) fail(path, formData, `เงินสด/เครดิตของ "${label}" ไม่ถูกต้อง`);
    const order = numberField(formData, `order_${i}`);
    rows.push({
      key: field(formData, `key_${i}`).slice(0, 60) || `${family}-${pricelist ? `PL${pricelist[1]}` : priceGroup}-${paymentKind}-${i}`, label, family,
      priceGroup: priceGroup as SummaryLine['priceGroup'], paymentKind: paymentKind as SummaryLine['paymentKind'],
      ...(pricelist ? { pricelistId: Number(pricelist[1]), pricelistName: pricelist[2].slice(0, 200) || null } : {}),
      order: Number.isFinite(order) ? order : i + 1,
    });
  }
  if (!rows.length) fail(path, formData, 'ต้องมีอย่างน้อย 1 บรรทัด');
  const keys = new Set<string>();
  for (const row of rows) {
    if (keys.has(row.key)) row.key = `${row.key}-${keys.size}`;
    keys.add(row.key);
  }
  const centralPercent = numberField(formData, 'centralPercent');
  const debtDays = numberField(formData, 'debtDays');
  const debtPercent = numberField(formData, 'debtPercent');
  if (!Number.isFinite(centralPercent) || centralPercent < 0 || centralPercent > 100) fail(path, formData, '% ส่วนกลางต้องอยู่ระหว่าง 0–100');
  if (!Number.isInteger(debtDays) || debtDays < 0 || debtDays > 3650) fail(path, formData, 'จำนวนวันลูกหนี้ค้างต้องเป็นจำนวนเต็ม 0–3650');
  if (!Number.isFinite(debtPercent) || debtPercent < 0 || debtPercent > 100) fail(path, formData, '% หักลูกหนี้ค้างต้องอยู่ระหว่าง 0–100');
  const summaryLines: SummaryLine[] = rows.sort((a, b) => a.order - b.order).map(({ order: _order, ...row }) => row);
  const settings = { summaryLines, centralPercent, debtDays, debtPercent };
  await repo.updateStatementSettings(source.id, settings);
  await audit(actor.id, 'commission.statement.save', 'CommissionSource', source.id, settings);
  revalidatePath(BASE, 'layout');
  back(path, formData, { saved: 'บันทึกแล้ว มีผลเมื่อกดคำนวณรอบที่ยังเป็นร่าง' });
}

/**
 * Replaces the statement rows with one row per rate set on an Odoo pricelist in the rates tab (in
 * force today), named after the pricelist and its rate, so the statement follows those rates.
 */
export async function seedStatementFromRatesAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/statement`;
  const source = await sourceOf(path, formData);
  const today = todayBangkok();
  const rates = (await repo.listRates(source.id)).filter((r) => r.odooPricelistId !== null && r.odooProductId === null && isValidOn(r, today));
  if (!rates.length) fail(path, formData, 'ยังไม่มีอัตราที่ตั้งราย pricelist ในแท็บอัตราค่าคอม');
  const seen = new Set<string>();
  const summaryLines: SummaryLine[] = [];
  for (const r of rates.sort((a, b) => (a.pricelistName ?? '').localeCompare(b.pricelistName ?? '', 'th'))) {
    const key = `PL${r.odooPricelistId}-${r.brand}-${r.family}`;
    if (seen.has(key) || summaryLines.length >= MAX_SUMMARY_LINES) continue;
    seen.add(key);
    const scope = [r.brand, r.family].filter((v) => v !== '*').join('-');
    summaryLines.push({
      key, label: `คอมมิชชั่น ${r.pricelistName ?? `pricelist #${r.odooPricelistId}`}${scope ? ` ${scope}` : ''} (${rateLabel(r)})`,
      family: r.family, priceGroup: '*', paymentKind: '*', pricelistId: r.odooPricelistId, pricelistName: r.pricelistName,
    });
  }
  const settings = { ...statementSettings(source), summaryLines };
  await repo.updateStatementSettings(source.id, settings);
  await audit(actor.id, 'commission.statement.seed', 'CommissionSource', source.id, { rows: summaryLines.length });
  revalidatePath(BASE, 'layout');
  back(path, formData, { saved: `สร้าง ${summaryLines.length} บรรทัดจากอัตราค่าคอม มีผลเมื่อกดคำนวณรอบที่ยังเป็นร่าง` });
}

// ---------- bonuses ----------

/** Most tiers a ladder can have. */
const MAX_TIERS = 20;

/**
 * Saves a company's bonuses: the sales-bonus ladder (rows `min_i` / `bonus_i` / `salary_i`; a blank
 * minimum drops the row; salaries on every tier or none), the baht per new customer and the day customers start counting as new (blank = off).
 * With `preset=jfc2569` the ladder is replaced by the client's JFC SOLUTION 2569 sheet.
 */
export async function saveBonusAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/bonus`;
  const source = await sourceOf(path, formData);
  let bonusTiers: BonusTier[];
  if (field(formData, 'preset') === 'jfc2569') bonusTiers = JFC_2569_TIERS;
  else {
    const rows: BonusTier[] = [];
    for (let i = 0; i < MAX_TIERS; i++) {
      if (!field(formData, `min_${i}`)) continue;
      const minAmount = numberField(formData, `min_${i}`);
      const bonus = field(formData, `bonus_${i}`) ? numberField(formData, `bonus_${i}`) : 0;
      const salary = field(formData, `salary_${i}`) ? numberField(formData, `salary_${i}`) : undefined;
      if (!Number.isFinite(minAmount) || minAmount <= 0) fail(path, formData, `ยอดเก็บขั้นที่ ${i + 1} ต้องมากกว่า 0`);
      if (!Number.isFinite(bonus) || bonus < 0) fail(path, formData, `เงินพิเศษขั้นที่ ${i + 1} ต้องเป็น 0 ขึ้นไป`);
      if (salary !== undefined && (!Number.isFinite(salary) || salary <= 0)) fail(path, formData, `เงินเดือนขั้นที่ ${i + 1} ต้องมากกว่า 0`);
      if (rows.some((r) => r.minAmount === minAmount)) fail(path, formData, `ยอดเก็บ ${minAmount.toLocaleString('th-TH')} ซ้ำกัน`);
      rows.push(salary === undefined ? { minAmount, bonus } : { minAmount, bonus, salary });
    }
    if (rows.some((r) => r.salary) && rows.some((r) => !r.salary)) fail(path, formData, 'ใส่เงินเดือนให้ครบทุกขั้น หรือเว้นว่างทุกขั้น (ถ้าเว้นว่าง ใช้ช่องเงินพิเศษแทน)');
    bonusTiers = normalizeTiers(rows);
  }
  const newCustomerBonus = field(formData, 'newCustomerBonus') ? numberField(formData, 'newCustomerBonus') : 0;
  if (!Number.isFinite(newCustomerBonus) || newCustomerBonus < 0 || newCustomerBonus > 1_000_000) fail(path, formData, 'เงินต่อลูกค้าใหม่ต้องอยู่ระหว่าง 0–1,000,000');
  const from = field(formData, 'newCustomerFrom');
  if (from && !isIsoDate(from)) fail(path, formData, 'วันเริ่มนับลูกค้าใหม่ไม่ถูกต้อง');
  if (newCustomerBonus > 0 && !from) fail(path, formData, 'ใส่วันเริ่มนับลูกค้าใหม่ด้วย ไม่งั้นลูกค้าเดิมทุกรายจะนับเป็นลูกค้าใหม่');
  const picked = field(formData, 'bonusBase');
  const bonusBase: BonusBase = picked === 'INVOICE' || picked === 'SALE_ORDER' ? picked : 'COLLECTION';
  const settings = { bonusBase, bonusTiers, newCustomerBonus, newCustomerFrom: from || null };
  try {
    await repo.updateBonusSettings(source.id, settings);
  } catch (error) {
    fail(path, formData, `บันทึกไม่ได้ (รัน migration 20261106150000_commission_bonus.sql${bonusBase !== 'COLLECTION' ? ' และ 20261110150000_commission_sale_orders.sql, 20261110180000_commission_invoice_base.sql' : ''} แล้วหรือยัง): ${errorText(error)}`);
  }
  await audit(actor.id, 'commission.bonus.save', 'CommissionSource', source.id, { from: bonusSettings(source), to: settings });
  revalidatePath(BASE, 'layout');
  back(path, formData, { saved: from !== (source.newCustomerFrom ?? '') || bonusBase !== bonusSettings(source).bonusBase
    ? 'บันทึกแล้ว · เปลี่ยนวันเริ่มนับลูกค้าใหม่หรือฐานคิดเงินพิเศษ ต้องกดดึงข้อมูลรอบที่ยังเป็นร่างใหม่ แล้วคำนวณ'
    : 'บันทึกแล้ว มีผลเมื่อกดคำนวณรอบที่ยังเป็นร่าง' });
}

const MAX_TARGET_STEPS = 10;

/** How the target turns into commission (per company): mode and, for LADDER, steps "from % of target → pay %". */
export async function saveTargetModeAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/targets`;
  const source = await sourceOf(path, formData);
  const picked = field(formData, 'targetMode') as TargetMode;
  if (!TARGET_MODES.includes(picked)) fail(path, formData, 'เลือกแบบการใช้เป้า');
  const steps: TargetStep[] = [];
  if (picked === 'LADDER') {
    for (let i = 0; i < MAX_TARGET_STEPS; i++) {
      if (!field(formData, `tmin_${i}`)) continue;
      const minPercent = numberField(formData, `tmin_${i}`);
      const payPercent = field(formData, `tpay_${i}`) ? numberField(formData, `tpay_${i}`) : NaN;
      if (!Number.isFinite(minPercent) || minPercent < 0 || minPercent > 1000) fail(path, formData, `ขั้นที่ ${i + 1}: % ของเป้าต้องอยู่ระหว่าง 0–1,000`);
      if (!Number.isFinite(payPercent) || payPercent < 0 || payPercent > 500) fail(path, formData, `ขั้นที่ ${i + 1}: % ค่าคอมที่ได้ต้องอยู่ระหว่าง 0–500`);
      if (steps.some((s) => s.minPercent === minPercent)) fail(path, formData, `% ของเป้า ${minPercent} ซ้ำกัน`);
      steps.push({ minPercent, payPercent });
    }
    if (!steps.length) fail(path, formData, 'แบบขั้นตาม % ของเป้า ต้องมีอย่างน้อย 1 ขั้น');
  }
  const settings = { targetMode: picked, targetSteps: normalizeTargetSteps(steps) };
  try {
    await repo.updateTargetSettings(source.id, settings);
  } catch (error) {
    fail(path, formData, `บันทึกไม่ได้: ${errorText(error)}`);
  }
  await audit(actor.id, 'commission.target-mode.save', 'CommissionSource', source.id, { from: targetSettings(source), to: settings });
  revalidatePath(BASE, 'layout');
  back(path, formData, { saved: 'บันทึกแบบการใช้เป้าแล้ว มีผลเมื่อกดคำนวณรอบที่ยังเป็นร่าง' });
}

// ---------- runs ----------

const runPath = (formData: FormData) => `${BASE}/runs/${field(formData, 'period')}`;

/** Pulls the period's cash-in from Odoo into the ledger (refused once approved). */
export async function syncPeriodAction(formData: FormData) {
  const actor = await requirePermission('commission.run');
  const path = field(formData, 'returnTo') === 'collections' ? `${BASE}/collections` : runPath(formData);
  const source = await sourceOf(path, formData);
  const period = periodOf(path, formData);
  const result: service.SyncResult = await service.syncPeriod(source, period)
    .catch((error: unknown) => ({ ok: false as const, reason: `ดึงข้อมูลจาก Odoo ไม่สำเร็จ: ${errorText(error)}` }));
  if (!result.ok) fail(path, formData, result.reason);
  const ok = result as Extract<service.SyncResult, { ok: true }>;
  await audit(actor.id, 'commission.sync', 'CommissionRun', `${source.id}:${period}`, { lines: ok.lines, receipts: ok.receipts, retro: ok.retro, refunds: ok.refunds, held: ok.held, released: ok.released, newCustomers: ok.newCustomers, saleOrders: ok.saleOrders, deferred: ok.deferred });
  revalidatePath(BASE, 'layout');
  await flash('ดึงข้อมูลจาก Odoo แล้ว', {
    icon: 'sync',
    description: `${ok.receipts} รายการเงินเข้า · ${ok.lines} บรรทัด${ok.retro ? ` · ปรับปรุงย้อนหลัง ${ok.retro}` : ''}${ok.held ? ` · หักลูกหนี้ค้าง ${ok.held} บิล` : ''}${ok.released ? ` · คืนลูกหนี้ค้าง ${ok.released} บิล` : ''}${ok.newCustomers ? ` · ลูกค้าใหม่ ${ok.newCustomers} ราย` : ''}${ok.saleOrders !== null ? ` · เอกสารขาย ${ok.saleOrders} ใบ (incentive)` : ''}${ok.deferred.count ? ` · รอจ่ายครบ ${ok.deferred.count} บิล (${ok.deferred.cash.toLocaleString('th-TH')} บาท ยกไปนับงวดที่จ่ายครบ)` : ''}${ok.refunds.count ? ` · มีเงินคืนลูกค้า ${ok.refunds.count} รายการ (ยังไม่หักอัตโนมัติ ใช้รายการปรับยอด)` : ''}`,
  });
  back(path, formData, { saved: '1' });
}

export async function calculateAction(formData: FormData) {
  const actor = await requirePermission('commission.run');
  const path = runPath(formData);
  const source = await sourceOf(path, formData);
  const result = await service.calculatePeriod(source, periodOf(path, formData));
  if (!result.ok) fail(path, formData, result.reason);
  const run = (result as Extract<typeof result, { ok: true }>).run;
  await audit(actor.id, 'commission.calculate', 'CommissionRun', run.id, { totalPayable: run.totalPayable, issues: run.results?.issues.length ?? 0 });
  revalidatePath(BASE, 'layout');
  back(path, formData, { saved: 'คำนวณแล้ว' });
}

/** Submit / approve / send back / mark paid, by `step`. */
export async function runStepAction(formData: FormData) {
  const step = field(formData, 'step');
  const actor = await requirePermission(step === 'submit' ? 'commission.run' : 'commission.approve');
  const path = runPath(formData);
  const source = await sourceOf(path, formData);
  const period = periodOf(path, formData);
  const result = step === 'submit' ? await service.submitRun(source.id, period, actor.id)
    : step === 'approve' ? await service.approveRun(source.id, period, actor.id)
    : step === 'reject' ? await service.rejectRun(source.id, period)
    : step === 'paid' ? await service.markRunPaid(source.id, period)
    : { ok: false as const, reason: 'คำสั่งไม่ถูกต้อง' };
  if (!result.ok) fail(path, formData, result.reason);
  const run = (result as Extract<typeof result, { ok: true }>).run;
  await audit(actor.id, `commission.run.${step}`, 'CommissionRun', run.id, { period, status: run.status, totalPayable: run.totalPayable });
  revalidatePath(BASE, 'layout');
  const labels: Record<string, string> = { submit: 'ส่งอนุมัติแล้ว', approve: 'อนุมัติแล้ว รอบนี้ถูกล็อก', reject: 'ตีกลับเป็นร่างแล้ว', paid: 'บันทึกจ่ายแล้ว' };
  back(path, formData, { saved: labels[step] ?? '1' });
}

/** Adds a manual adjustment (reason required) to a draft run; recalculate to apply it. */
export async function addAdjustmentAction(formData: FormData) {
  const actor = await requirePermission('commission.run');
  const path = runPath(formData);
  const source = await sourceOf(path, formData);
  const run = await repo.getRun(source.id, periodOf(path, formData));
  if (!run || run.status !== 'DRAFT') fail(path, formData, 'ปรับยอดได้เฉพาะรอบที่เป็นร่าง');
  const odooUserId = Number(field(formData, 'odooUserId'));
  const amount = numberField(formData, 'amount');
  const reason = field(formData, 'reason').slice(0, 300);
  if (!Number.isInteger(odooUserId) || odooUserId <= 0) fail(path, formData, 'เลือกพนักงานขาย');
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10_000_000) fail(path, formData, 'จำนวนเงินไม่ถูกต้อง');
  if (!reason) fail(path, formData, 'ต้องระบุเหตุผลการปรับยอด');
  await repo.addAdjustment({ runId: run!.id, odooUserId, amount: Math.round(amount * 100) / 100, reason }, actor.id);
  await audit(actor.id, 'commission.adjustment.add', 'CommissionRun', run!.id, { odooUserId, amount, reason });
  back(path, formData, { saved: 'เพิ่มรายการปรับแล้ว กดคำนวณใหม่เพื่อให้มีผล' });
}

export async function deleteAdjustmentAction(formData: FormData) {
  const actor = await requirePermission('commission.run');
  const path = runPath(formData);
  const source = await sourceOf(path, formData);
  const run = await repo.getRun(source.id, periodOf(path, formData));
  if (!run || run.status !== 'DRAFT') fail(path, formData, 'ลบรายการปรับได้เฉพาะรอบที่เป็นร่าง');
  const id = field(formData, 'id');
  await repo.deleteAdjustment(id, run!.id);
  await audit(actor.id, 'commission.adjustment.delete', 'CommissionAdjustment', id);
  back(path, formData, { saved: 'ลบรายการปรับแล้ว กดคำนวณใหม่เพื่อให้มีผล' });
}

// ---------- period dates ----------

/**
 * Sets one period's own end date and pay date (blank = follow the company rule; "reset" clears both).
 * The end can only move while this period and the next one are not approved, because it also moves
 * the next period's start. The pay date can change until the period is paid.
 */
export async function savePeriodDatesAction(formData: FormData) {
  const actor = await requirePermission('commission.run');
  const period = field(formData, 'period');
  const path = field(formData, 'from') === 'periods' ? `${BASE}/periods` : `${BASE}/runs/${isPeriod(period) ? period : ''}`;
  const source = await sourceOf(path, formData);
  periodOf(path, formData);
  const reset = field(formData, 'reset') === '1';
  const endDate = reset ? null : field(formData, 'endDate') || null;
  const payDate = reset ? null : field(formData, 'payDate') || null;
  const note = reset ? null : field(formData, 'note').slice(0, 200) || null;

  const calendar = await service.periodCalendar(source);
  const before = periodDates(calendar, period);
  const [run, nextRun] = await Promise.all([repo.getRun(source.id, period), repo.getRun(source.id, shiftPeriod(period, 1))]);
  const ruleOnly = periodDates({ ...calendar, overrides: calendar.overrides.filter((o) => o.period !== period) }, period);
  const newEnd = endDate ?? ruleOnly.end;
  const newPay = payDate ?? ruleOnly.payDate;

  if (newEnd !== before.end) {
    if (service.isLocked(run)) fail(path, formData, 'รอบนี้อนุมัติแล้ว เปลี่ยนวันสิ้นสุดไม่ได้');
    if (service.isLocked(nextRun)) fail(path, formData, 'รอบถัดไปอนุมัติแล้ว เปลี่ยนวันสิ้นสุดรอบนี้ไม่ได้ (จะทำให้วันเริ่มของรอบถัดไปเลื่อน)');
    const problem = endDateProblem(calendar, period, newEnd);
    if (problem) fail(path, formData, problem);
  }
  if (payDate && !isIsoDate(payDate)) fail(path, formData, 'วันจ่ายไม่ถูกต้อง');
  if (newPay < newEnd) fail(path, formData, `วันจ่ายต้องไม่ก่อนวันสิ้นสุดรอบ (${thaiDay(newEnd)})`);
  if (newPay !== before.payDate && run?.status === 'PAID') fail(path, formData, 'รอบนี้จ่ายแล้ว เปลี่ยนวันจ่ายไม่ได้');

  await repo.savePeriodOverride(source.id, {
    period, endDate: endDate && endDate !== ruleOnly.end ? endDate : null, payDate: payDate && payDate !== ruleOnly.payDate ? payDate : null, note,
  }, actor.id);
  await audit(actor.id, 'commission.period.dates', 'CommissionSource', source.id, { period, from: { end: before.end, pay: before.payDate }, to: { end: newEnd, pay: newPay } });
  revalidatePath(BASE, 'layout');
  const resync = newEnd !== before.end && (run?.syncedAt || nextRun?.syncedAt);
  back(path, formData, { saved: resync ? `บันทึกวันที่รอบ ${period} แล้ว ช่วงวันเปลี่ยน เปิดรอบแล้วกด “1. ดึงข้อมูล” ใหม่ (รอบถัดไปด้วยถ้าดึงไว้แล้ว)` : `บันทึกวันที่รอบ ${period} แล้ว` });
}

const periodRuleSchema = z.object({
  cutoffDay: z.coerce.number().int().min(1, 'วันตัดรอบ 1–28').max(28, 'วันตัดรอบ 1–28'),
  payDay: z.coerce.number().int().min(0, 'วันจ่าย 1–31 หรือสิ้นเดือน').max(31, 'วันจ่าย 1–31 หรือสิ้นเดือน'),
  payMonths: z.coerce.number().int().min(0, 'จ่ายหลังสิ้นรอบ 0–6 เดือน').max(6, 'จ่ายหลังสิ้นรอบ 0–6 เดือน'),
});

/**
 * Saves a company's period rule: cut-off day and default pay day. The cut-off day cannot change once
 * a run is approved, since that would move the dates of locked periods (set those periods' own dates instead).
 */
export async function savePeriodRuleAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/periods`;
  const source = await sourceOf(path, formData);
  const parsed = periodRuleSchema.safeParse({ cutoffDay: field(formData, 'cutoffDay'), payDay: field(formData, 'payDay'), payMonths: field(formData, 'payMonths') });
  if (!parsed.success) fail(path, formData, parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const rule = parsed.data!;
  if (rule.cutoffDay !== source.cutoffDay) {
    const locked = (await repo.listRuns(source.id)).filter((r) => service.isLocked(r));
    if (locked.length) fail(path, formData, `เปลี่ยนวันตัดรอบไม่ได้ เพราะมีรอบที่อนุมัติแล้ว (${locked.map((r) => r.period).join(', ')}) ถ้าต้องการเลื่อนบางรอบ ให้แก้วันสิ้นสุดของรอบนั้นในตารางด้านล่าง`);
  }
  await repo.updateSource(source.id, rule);
  await audit(actor.id, 'commission.period.rule', 'CommissionSource', source.id, { from: { cutoffDay: source.cutoffDay, payDay: source.payDay, payMonths: source.payMonths }, to: rule });
  revalidatePath(BASE, 'layout');
  back(path, formData, { saved: 'บันทึกค่าตั้งต้นของรอบแล้ว' });
}
