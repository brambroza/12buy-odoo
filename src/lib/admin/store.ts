/**
 * Admin settings: zones, price books, dealer assignments, credit↔cash pairs, customer groups.
 * Stored as one versioned JSON document in Supabase (`AdminState`, id `main`); every write
 * re-reads the document and saves with optimistic locking on `version`, retrying on conflict.
 * Never touches Odoo.
 *
 * Reads return plain snapshots. Code that needs several lookups in one request (dealer profile)
 * should call `getAdminSnapshot()` once and use the pure `*In` helpers.
 */
import { db } from '@/lib/db/client';
import { unwrap } from '@/lib/db/rows';
import type { DealerTier } from '@/lib/shop/types';
import type { CashPair, CashPercent, CustomerGroup, ProductCashDiscount, DealerAssignment, PriceBook, PriceZone } from './types';

/**
 * `groupMembers` maps a dealer id (DB) to its customer group id; a dealer is in at most one group.
 * `productCashDiscounts` is keyed by Odoo product template id.
 */
export type AdminShape = { zones: PriceZone[]; books: PriceBook[]; dealers: DealerAssignment[]; cashPairs: CashPair[]; cashPercents: CashPercent[]; productCashDiscounts: Record<string, ProductCashDiscount>; groups: CustomerGroup[]; groupMembers: Record<string, string> };

const ROW_ID = 'main';
const MAX_ATTEMPTS = 5;
const DEFAULT_ZONE: PriceZone = { id: 'default', name: 'ทั่วประเทศ (ค่าเริ่มต้น)', provinces: [], isDefault: true };

/** Fills missing parts so older documents keep working. */
export function normalizeAdmin(input: Partial<AdminShape> | null | undefined): AdminShape {
  const data: AdminShape = {
    zones: input?.zones ?? [],
    books: input?.books ?? [],
    dealers: input?.dealers ?? [],
    cashPairs: input?.cashPairs ?? [],
    cashPercents: input?.cashPercents ?? [],
    productCashDiscounts: input?.productCashDiscounts ?? {},
    groups: input?.groups ?? [],
    groupMembers: input?.groupMembers ?? {},
  };
  if (!data.zones.some((z) => z.isDefault)) data.zones.unshift({ ...DEFAULT_ZONE });
  return data;
}

async function loadRow(): Promise<{ data: AdminShape; version: number | null }> {
  const row = unwrap(await db().from('AdminState').select('data, version').eq('id', ROW_ID).maybeSingle()) as { data: Partial<AdminShape>; version: number } | null;
  return { data: normalizeAdmin(row?.data), version: row?.version ?? null };
}

/** Current admin settings (one DB read). */
export async function getAdminSnapshot(): Promise<AdminShape> {
  return (await loadRow()).data;
}

/**
 * Applies `change` to a fresh copy of the document and saves it if nobody saved in between.
 * Retries on a concurrent write; `change` must therefore be safe to run more than once.
 */
async function mutate<T>(change: (data: AdminShape) => T): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, version } = await loadRow();
    const result = change(data);
    const now = new Date().toISOString();
    if (version === null) {
      const { error } = await db().from('AdminState').insert({ id: ROW_ID, data, version: 1, updatedAt: now });
      if (!error) return result;
      if (error.code !== '23505') unwrap({ data: null, error });
      continue;
    }
    const saved = unwrap(await db().from('AdminState').update({ data, version: version + 1, updatedAt: now }).eq('id', ROW_ID).eq('version', version).select('version')) as unknown[];
    if (saved.length) return result;
  }
  throw new Error('บันทึกการตั้งค่าไม่สำเร็จ มีคนแก้ไขพร้อมกัน กรุณาลองใหม่');
}

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- pure lookups over a snapshot ----------

/** Resolves a province name to its zone (default zone when unassigned). */
export function zoneForProvince(province: string, zones: PriceZone[]): PriceZone {
  return zones.find((z) => !z.isDefault && z.provinces.includes(province)) ?? zones.find((z) => z.isDefault) ?? DEFAULT_ZONE;
}

export function findBookIn(data: AdminShape, zoneId: string, tier: DealerTier): PriceBook | undefined {
  return data.books.find((b) => b.zoneId === zoneId && b.tier === tier);
}

/** Cash pricelist paired with a credit pricelist, if configured. */
export function cashPricelistFor(creditPricelistId: number, pairs: CashPair[]): number | null {
  return pairs.find((p) => p.creditPricelistId === creditPricelistId)?.cashPricelistId ?? null;
}

/** Cash discount % set on a pricelist, if any. */
export function cashPercentFor(pricelistId: number, percents: CashPercent[]): number | null {
  return percents.find((p) => p.pricelistId === pricelistId)?.percent ?? null;
}

export function groupForDealerIn(data: AdminShape, dealerId: string): CustomerGroup | undefined {
  const groupId = data.groupMembers[dealerId];
  return groupId ? data.groups.find((g) => g.id === groupId) : undefined;
}

/** Suggests the cash counterpart of a credit pricelist by name (`… (Credit)` → `… (Cash)`). */
export function suggestCashPair(credit: { id: number; name: string }, pricelists: { id: number; name: string }[]): number | null {
  if (!/credit/i.test(credit.name)) return null;
  const target = credit.name.replace(/credit/i, 'cash').replace(/\s+/g, '').toLowerCase();
  return pricelists.find((p) => p.id !== credit.id && p.name.replace(/\s+/g, '').toLowerCase() === target)?.id ?? null;
}

// ---------- zones ----------

export async function listZones(): Promise<PriceZone[]> {
  return (await getAdminSnapshot()).zones;
}

export async function getZone(id: string): Promise<PriceZone | undefined> {
  return (await listZones()).find((z) => z.id === id);
}

/**
 * Creates or updates a zone. A province can belong to only one non-default zone;
 * provinces given here are removed from any other zone.
 */
export function upsertZone(input: { id?: string; name: string; provinces: string[] }): Promise<PriceZone> {
  const createdId = newId('zone');
  return mutate((data) => {
    const provinces = [...new Set(input.provinces)];
    for (const zone of data.zones) if (zone.id !== input.id) zone.provinces = zone.provinces.filter((p) => !provinces.includes(p));
    const existing = input.id ? data.zones.find((z) => z.id === input.id) : undefined;
    if (existing) {
      if (!existing.isDefault) Object.assign(existing, { name: input.name, provinces });
      return { ...existing };
    }
    const zone: PriceZone = { id: createdId, name: input.name, provinces, isDefault: false };
    data.zones.push(zone);
    return zone;
  });
}

export function deleteZone(id: string): Promise<boolean> {
  return mutate((data) => {
    const zone = data.zones.find((z) => z.id === id);
    if (!zone || zone.isDefault) return false;
    data.zones = data.zones.filter((z) => z.id !== id);
    data.books = data.books.filter((b) => b.zoneId !== id);
    return true;
  });
}

// ---------- price books ----------

export async function listBooks(): Promise<PriceBook[]> {
  return (await getAdminSnapshot()).books;
}

export async function getBook(id: string): Promise<PriceBook | undefined> {
  return (await listBooks()).find((b) => b.id === id);
}

export async function findBook(zoneId: string, tier: DealerTier): Promise<PriceBook | undefined> {
  return findBookIn(await getAdminSnapshot(), zoneId, tier);
}

/** Returns the book for a zone × tier, creating an empty draft when missing. */
export function ensureBook(zoneId: string, tier: DealerTier, basePricelistId: number): Promise<PriceBook> {
  const createdId = newId('book');
  return mutate((data) => {
    const existing = findBookIn(data, zoneId, tier);
    if (existing) return existing;
    const book: PriceBook = { id: createdId, zoneId, tier, basePricelistId, entries: {}, typePercent: {}, status: 'DRAFT', submittedBy: null, approvedBy: null, updatedAt: new Date().toISOString(), publishedAt: null, lastDryRun: null };
    data.books.push(book);
    return book;
  });
}

type BookPatch = Partial<Pick<PriceBook, 'basePricelistId' | 'entries' | 'typePercent' | 'status' | 'publishedAt' | 'lastDryRun' | 'submittedBy' | 'submittedById' | 'approvedBy' | 'odooPricelistId' | 'odooPublish'>>;

/** Pure: applies a patch; price changes send the book back to DRAFT. */
function patchBook(book: PriceBook, patch: BookPatch) {
  Object.assign(book, patch, { updatedAt: new Date().toISOString() });
  if (patch.entries || patch.typePercent || patch.basePricelistId !== undefined) {
    book.status = 'DRAFT';
    book.submittedBy = null;
    book.submittedById = null;
    book.approvedBy = null;
  }
}

export function updateBook(id: string, patch: BookPatch): Promise<PriceBook | undefined> {
  return mutate((data) => {
    const book = data.books.find((b) => b.id === id);
    if (!book) return undefined;
    patchBook(book, patch);
    return book;
  });
}

type BookResult = { ok: true; book: PriceBook } | { ok: false; reason: string };

/** Who submits / approves a book: the signed-in staff member. */
export type BookActor = { id: string; name: string };

/** Editor submits a book for approval. Requires a dry run so the reviewer sees the Odoo diff. */
export function submitBook(id: string, submitter: BookActor): Promise<BookResult> {
  return mutate((data): BookResult => {
    const book = data.books.find((b) => b.id === id);
    if (!book) return { ok: false, reason: 'ไม่พบตารางราคา' };
    if (!book.lastDryRun) return { ok: false, reason: 'กด "คำนวณ diff" ก่อนส่งอนุมัติ เพื่อให้ผู้อนุมัติเห็นสิ่งที่จะเปลี่ยนใน Odoo' };
    if (!Object.keys(book.entries).length && !Object.keys(book.typePercent).length) return { ok: false, reason: 'ตารางยังว่าง นำเข้าราคาหรือกรอกก่อน' };
    patchBook(book, { status: 'PENDING_APPROVAL', submittedBy: submitter.name, submittedById: submitter.id });
    return { ok: true, book };
  });
}

/** A different person (by login, not by typed name) approves → published. */
export function approveBook(id: string, approver: BookActor): Promise<BookResult> {
  return mutate((data): BookResult => {
    const book = data.books.find((b) => b.id === id);
    if (!book) return { ok: false, reason: 'ไม่พบตารางราคา' };
    if (book.status !== 'PENDING_APPROVAL') return { ok: false, reason: 'ตารางนี้ยังไม่ได้ส่งอนุมัติ' };
    const sameLogin = book.submittedById ? book.submittedById === approver.id : (book.submittedBy ?? '').trim().toLowerCase() === approver.name.trim().toLowerCase();
    if (sameLogin) return { ok: false, reason: 'ผู้อนุมัติต้องไม่ใช่คนเดียวกับผู้ส่ง (ให้แอดมินอีกคนเข้าสู่ระบบแล้วกดอนุมัติ)' };
    patchBook(book, { status: 'PUBLISHED', approvedBy: approver.name, publishedAt: new Date().toISOString() });
    return { ok: true, book };
  });
}

export function rejectBook(id: string): Promise<PriceBook | undefined> {
  return updateBook(id, { status: 'DRAFT', submittedBy: null, submittedById: null, approvedBy: null });
}

/** Sets or clears one product price in a book. */
export function setEntry(id: string, tmplId: number, price: number | null): Promise<PriceBook | undefined> {
  return mutate((data) => {
    const book = data.books.find((b) => b.id === id);
    if (!book) return undefined;
    const entries = { ...book.entries };
    if (price === null) delete entries[String(tmplId)];
    else entries[String(tmplId)] = price;
    patchBook(book, { entries });
    return book;
  });
}

// ---------- dealers ----------

export async function listAssignments(): Promise<DealerAssignment[]> {
  return (await getAdminSnapshot()).dealers;
}

export async function getAssignment(odooPartnerId: number): Promise<DealerAssignment | undefined> {
  return (await listAssignments()).find((d) => d.odooPartnerId === odooPartnerId);
}

export function upsertAssignment(input: Omit<DealerAssignment, 'updatedAt'>): Promise<DealerAssignment> {
  return mutate((data) => {
    const record: DealerAssignment = { ...input, updatedAt: new Date().toISOString() };
    const existing = data.dealers.find((d) => d.odooPartnerId === input.odooPartnerId);
    if (existing) Object.assign(existing, record);
    else data.dealers.push(record);
    return record;
  });
}

// ---------- credit ↔ cash pricelist pairs ----------

export async function listCashPairs(): Promise<CashPair[]> {
  return (await getAdminSnapshot()).cashPairs;
}

/** Replaces all pairs. One cash pricelist per credit pricelist; self-pairs are dropped. */
export function saveCashPairs(pairs: CashPair[]): Promise<CashPair[]> {
  return mutate((data) => {
    const byCredit = new Map<number, CashPair>();
    for (const pair of pairs) if (pair.creditPricelistId !== pair.cashPricelistId) byCredit.set(pair.creditPricelistId, pair);
    data.cashPairs = [...byCredit.values()];
    return data.cashPairs;
  });
}

export async function listCashPercents(): Promise<CashPercent[]> {
  return (await getAdminSnapshot()).cashPercents;
}

/** Replaces all pricelist cash %. One % per pricelist; values outside 0 < % ≤ 50 are dropped. */
export function saveCashPercents(percents: CashPercent[]): Promise<CashPercent[]> {
  return mutate((data) => {
    const byPricelist = new Map<number, CashPercent>();
    for (const p of percents) if (isCashPercent(p.percent)) byPricelist.set(p.pricelistId, { pricelistId: p.pricelistId, percent: Math.round(p.percent * 100) / 100 });
    data.cashPercents = [...byPricelist.values()];
    return data.cashPercents;
  });
}

/** Valid cash discount % on a pricelist: above 0, at most 50. */
export function isCashPercent(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 50;
}

// ---------- cash discount per product ----------

/** Valid product cash discount: 0 < % ≤ 50, or 0 < baht ≤ 100,000 per base unit. */
export function isProductCashDiscount(d: { kind: string; value: number }): d is ProductCashDiscount {
  if (!Number.isFinite(d.value) || d.value <= 0) return false;
  if (d.kind === 'PERCENT') return d.value <= 50;
  return d.kind === 'BAHT' && d.value <= 100_000;
}

export async function listProductCashDiscounts(): Promise<Record<string, ProductCashDiscount>> {
  return (await getAdminSnapshot()).productCashDiscounts;
}

/**
 * Sets or clears (null) the cash discount of the given product templates; others are kept.
 * Invalid values are dropped. Returns how many products now have one.
 */
export function setProductCashDiscounts(changes: Record<string, ProductCashDiscount | null>): Promise<number> {
  return mutate((data) => {
    const next = { ...data.productCashDiscounts };
    for (const [tmplId, discount] of Object.entries(changes)) {
      if (!/^\d+$/.test(tmplId)) continue;
      if (discount && isProductCashDiscount(discount)) next[tmplId] = { kind: discount.kind, value: Math.round(discount.value * 100) / 100 };
      else delete next[tmplId];
    }
    data.productCashDiscounts = next;
    return Object.keys(next).length;
  });
}

// ---------- customer groups ----------

export async function listGroups(): Promise<CustomerGroup[]> {
  return (await getAdminSnapshot()).groups;
}

export async function getGroup(id: string | null | undefined): Promise<CustomerGroup | undefined> {
  return id ? (await listGroups()).find((g) => g.id === id) : undefined;
}

/** Creates or replaces a group's settings. Lists are de-duplicated. */
export function upsertGroup(input: Omit<CustomerGroup, 'id' | 'updatedAt'> & { id?: string }): Promise<CustomerGroup> {
  const createdId = newId('grp');
  return mutate((data) => {
    const unique = <T>(values: T[]) => [...new Set(values)];
    const values = {
      name: input.name,
      brands: unique(input.brands.map((b) => b.toUpperCase())),
      categoryIds: unique(input.categoryIds),
      includeTmplIds: unique(input.includeTmplIds),
      excludeTmplIds: unique(input.excludeTmplIds),
      updatedAt: new Date().toISOString(),
    };
    const existing = input.id ? data.groups.find((g) => g.id === input.id) : undefined;
    if (existing) return Object.assign(existing, values);
    const group: CustomerGroup = { id: createdId, ...values };
    data.groups.push(group);
    return group;
  });
}

/** Deletes a group; its dealers go back to seeing every product of their families. */
export function deleteGroup(id: string): Promise<boolean> {
  return mutate((data) => {
    if (!data.groups.some((g) => g.id === id)) return false;
    data.groups = data.groups.filter((g) => g.id !== id);
    for (const [dealerId, groupId] of Object.entries(data.groupMembers)) if (groupId === id) delete data.groupMembers[dealerId];
    return true;
  });
}

/** Puts a dealer in a group, or removes it from any group (`null` or an unknown id). */
export function setDealerGroup(dealerId: string, groupId: string | null): Promise<void> {
  return mutate((data) => {
    if (groupId && data.groups.some((g) => g.id === groupId)) data.groupMembers[dealerId] = groupId;
    else delete data.groupMembers[dealerId];
  });
}

export async function groupForDealer(dealerId: string): Promise<CustomerGroup | undefined> {
  return groupForDealerIn(await getAdminSnapshot(), dealerId);
}

/** Number of dealers per group id. */
export async function groupMemberCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const groupId of Object.values((await getAdminSnapshot()).groupMembers)) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  return counts;
}
