'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/auth/audit';
import { requirePermission } from '@/lib/auth/session';
import { flash } from '@/lib/flash';
import { isValidOn, rateLabel, stepProblems } from '@/lib/commission/calc';
import { fetchOdooUsers, fetchPricelists } from '@/lib/commission/odoo';
import { isIsoDate, isPeriod, shiftPeriod, todayBangkok } from '@/lib/commission/period';
import { statementSettings } from '@/lib/commission/statement';
import * as repo from '@/lib/commission/repo';
import * as service from '@/lib/commission/service';
import { parseTargetLines } from '@/lib/commission/targets';
import type { CommissionSource, PriceGroup, SummaryLine } from '@/lib/commission/types';
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
    apiKey: field(formData, 'apiKey'), cutoffDay: field(formData, 'cutoffDay') || '20', active: formData.get('active') === 'on',
  });
  if (!parsed.success) fail(path, formData, parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const input = parsed.data!;
  const existing = id ? await repo.getSource(id) : null;
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
  const row = { name: input.name, url: input.url, db: input.db, username: input.username, apiKeyEnc: encryptSecret(apiKey), cutoffDay: input.cutoffDay, active: input.active };
  const sourceId = existing ? existing.id : await repo.createSource(row);
  if (existing) await repo.updateSource(existing.id, row);
  service.forgetClient(sourceId);
  await audit(actor.id, existing ? 'commission.source.update' : 'commission.source.create', 'CommissionSource', sourceId, {
    name: input.name, url: input.url, db: input.db, username: input.username, apiKeyLast4: apiKey.slice(-4), apiKeyChanged: Boolean(input.apiKey),
    cutoffDay: input.cutoffDay, active: input.active, odooUid: probe!.uid, serverVersion: probe!.serverVersion,
  });
  revalidatePath(BASE, 'layout');
  await flash('บันทึกบริษัทแล้ว', { icon: 'sync', description: `${input.name} · Odoo ${probe!.serverVersion}` });
  redirect(`${path}?source=${sourceId}&saved=1`);
}

// ---------- reps ----------

/** Pulls the company's internal Odoo users as reps (new ones added, names refreshed). */
export async function syncRepsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/reps`;
  const source = await sourceOf(path, formData);
  let added = 0;
  try {
    added = await repo.upsertReps(source.id, await fetchOdooUsers(service.clientFor(source)));
  } catch (error) {
    fail(path, formData, `ดึงผู้ใช้จาก Odoo ไม่สำเร็จ: ${errorText(error)}`);
  }
  await audit(actor.id, 'commission.reps.sync', 'CommissionSource', source.id, { added });
  revalidatePath(path);
  back(path, formData, { saved: `ดึงพนักงานขายแล้ว เพิ่มใหม่ ${added} คน` });
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
  const parsed = rateSchema.safeParse({
    brand: field(formData, 'brand'), family: field(formData, 'family'), priceGroup: pricelist ? '*' : price,
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
  const reps = await repo.listReps(source.id);
  const values = new Map<number, number | null>();
  for (const rep of reps) {
    if (!formData.has(`t_${rep.odooUserId}`)) continue;
    const raw = field(formData, `t_${rep.odooUserId}`);
    const amount = raw ? Number(raw.replace(/,/g, '')) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) fail(path, formData, `เป้าของ ${rep.name} ไม่ถูกต้อง`);
    values.set(rep.odooUserId, amount === null ? null : Math.round(amount * 100) / 100);
  }
  await repo.saveTargets(source.id, period, values, actor.id);
  await audit(actor.id, 'commission.targets.save', 'CommissionSource', source.id, { period, targets: Object.fromEntries(values) });
  revalidatePath(path);
  back(path, formData, { saved: '1' });
}

/** Copies last period's targets into this period for reps that have none yet. */
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
  await audit(actor.id, 'commission.targets.copy', 'CommissionSource', source.id, { period, count: values.size });
  revalidatePath(path);
  back(path, formData, { saved: `คัดลอกเป้า ${values.size} คนจากรอบก่อน` });
}

/** Imports targets pasted from Excel: one rep per line, "name or Odoo user id <tab/comma> amount". */
export async function importTargetsAction(formData: FormData) {
  const actor = await requirePermission('commission.manage');
  const path = `${BASE}/targets`;
  const source = await sourceOf(path, formData);
  const period = periodOf(path, formData);
  await assertPeriodOpen(path, formData, source.id, period);
  const reps = await repo.listReps(source.id);
  const result = parseTargetLines(field(formData, 'paste'), reps);
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
  await audit(actor.id, 'commission.sync', 'CommissionRun', `${source.id}:${period}`, { lines: ok.lines, receipts: ok.receipts, retro: ok.retro, refunds: ok.refunds, held: ok.held, released: ok.released });
  revalidatePath(BASE, 'layout');
  await flash('ดึงข้อมูลจาก Odoo แล้ว', {
    icon: 'sync',
    description: `${ok.receipts} รายการเงินเข้า · ${ok.lines} บรรทัด${ok.retro ? ` · ปรับปรุงย้อนหลัง ${ok.retro}` : ''}${ok.held ? ` · หักลูกหนี้ค้าง ${ok.held} บิล` : ''}${ok.released ? ` · คืนลูกหนี้ค้าง ${ok.released} บิล` : ''}${ok.refunds.count ? ` · มีเงินคืนลูกค้า ${ok.refunds.count} รายการ (ยังไม่หักอัตโนมัติ ใช้รายการปรับยอด)` : ''}`,
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
