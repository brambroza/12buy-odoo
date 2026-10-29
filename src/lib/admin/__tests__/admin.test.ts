import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/db/__tests__/fake-db';
import { dryRunPublish, pricelistNameFor } from '../dry-run';
import type { PriceBook, PriceZone } from '../types';
import type { PricelistItem } from '@/lib/shop/price-engine';

let fake = createFakeDb();
vi.mock('@/lib/db/client', () => ({ db: () => fake.client }));

const store = await import('../store');

beforeEach(() => {
  fake = createFakeDb();
});

describe('zones', () => {
  it('always has a default zone and moves provinces between zones', async () => {
    expect((await store.listZones()).some((z) => z.isDefault)).toBe(true);
    const north = (await store.upsertZone({ name: 'เหนือ', provinces: ['จังหวัดเชียงใหม่', 'จังหวัดลำพูน'] }));
    const upper = (await store.upsertZone({ name: 'เหนือบน', provinces: ['จังหวัดเชียงใหม่'] }));
    expect((await store.getZone(north.id))?.provinces).toEqual(['จังหวัดลำพูน']);
    expect((await store.getZone(upper.id))?.provinces).toEqual(['จังหวัดเชียงใหม่']);
    expect(store.zoneForProvince('จังหวัดเชียงใหม่', await store.listZones()).id).toBe(upper.id);
    expect(store.zoneForProvince('จังหวัดภูเก็ต', await store.listZones()).isDefault).toBe(true);
  });

  it('cannot delete the default zone and removes books with a zone', async () => {
    const z = (await store.upsertZone({ name: 'ใต้', provinces: ['จังหวัดภูเก็ต'] }));
    await store.ensureBook(z.id, 'M', 1);
    expect((await store.deleteZone('default'))).toBe(false);
    expect((await store.deleteZone(z.id))).toBe(true);
    expect((await store.listBooks())).toHaveLength(0);
  });
});

describe('price books', () => {
  it('creates one book per zone × tier and resets to draft on edits', async () => {
    const a = (await store.ensureBook('default', 'L', 9));
    const b = (await store.ensureBook('default', 'L', 1));
    expect(a.id).toBe(b.id);
    await store.updateBook(a.id, { status: 'PUBLISHED', publishedAt: 'x' });
    expect((await store.getBook(a.id))?.status).toBe('PUBLISHED');
    await store.setEntry(a.id, 777, 2400);
    expect((await store.getBook(a.id))?.status).toBe('DRAFT');
    expect((await store.getBook(a.id))?.entries).toEqual({ '777': 2400 });
    await store.setEntry(a.id, 777, null);
    expect((await store.getBook(a.id))?.entries).toEqual({});
  });
});

describe('approval workflow', () => {
  it('requires a dry run before submit, and a different approver', async () => {
    const b = (await store.ensureBook('default', 'S', 1));
    expect((await store.submitBook(b.id, 'กิ่ง'))).toMatchObject({ ok: false });
    await store.updateBook(b.id, { entries: { '1': 100 } });
    await store.updateBook(b.id, { lastDryRun: { at: '', pricelistName: 'x', targetPricelistId: null, create: [], update: [], unlink: [], unchanged: 0 } });
    expect((await store.submitBook(b.id, 'กิ่ง'))).toMatchObject({ ok: true });
    expect((await store.getBook(b.id))?.status).toBe('PENDING_APPROVAL');
    expect((await store.approveBook(b.id, 'กิ่ง'))).toMatchObject({ ok: false, reason: expect.stringContaining('คนเดียว') });
    expect((await store.approveBook(b.id, 'บอส'))).toMatchObject({ ok: true });
    expect((await store.getBook(b.id))).toMatchObject({ status: 'PUBLISHED', submittedBy: 'กิ่ง', approvedBy: 'บอส' });
    await store.setEntry(b.id, 1, 120);
    expect((await store.getBook(b.id))).toMatchObject({ status: 'DRAFT', submittedBy: null, approvedBy: null });
  });

  it('reject returns to draft', async () => {
    const b = (await store.ensureBook('default', 'L', 1));
    await store.updateBook(b.id, { entries: { '1': 1 }, lastDryRun: { at: '', pricelistName: 'x', targetPricelistId: null, create: [], update: [], unlink: [], unchanged: 0 } });
    await store.submitBook(b.id, 'a');
    expect((await store.rejectBook(b.id))?.status).toBe('DRAFT');
  });
});

describe('dealer assignments', () => {
  it('upserts by partner id', async () => {
    await store.upsertAssignment({ odooPartnerId: 92, types: ['CAR'], tier: 'S', status: 'PENDING' });
    await store.upsertAssignment({ odooPartnerId: 92, types: ['CAR', 'TRUCK'], tier: 'L', status: 'ACTIVE' });
    expect((await store.listAssignments())).toHaveLength(1);
    expect((await store.getAssignment(92))?.tier).toBe('L');
  });
});

describe('cash pairs', () => {
  const pricelists = [{ id: 7, name: 'ราคาTBRร้านค้าปลีก (Credit)' }, { id: 8, name: 'ราคาTBRร้านค้าปลีก (Cash)' }, { id: 10, name: 'ราคา PCR ร้านค้าปลีก (Credit)' }, { id: 9, name: 'ราคา PCR ร้านค้าปลีก (Cash)' }, { id: 3, name: 'ราคาร้านปลีกแบตเตอรี่' }];

  it('suggests the cash pricelist by name', async () => {
    expect(store.suggestCashPair(pricelists[0], pricelists)).toBe(8);
    expect(store.suggestCashPair(pricelists[2], pricelists)).toBe(9);
    expect(store.suggestCashPair(pricelists[4], pricelists)).toBeNull();
  });

  it('saves one pair per credit pricelist and drops self-pairs', async () => {
    await store.saveCashPairs([{ creditPricelistId: 7, cashPricelistId: 12 }, { creditPricelistId: 7, cashPricelistId: 8 }, { creditPricelistId: 3, cashPricelistId: 3 }]);
    expect((await store.listCashPairs())).toEqual([{ creditPricelistId: 7, cashPricelistId: 8 }]);
    expect(store.cashPricelistFor(7, await store.listCashPairs())).toBe(8);
    expect(store.cashPricelistFor(10, await store.listCashPairs())).toBeNull();
  });
});

describe('dryRunPublish', () => {
  const zone: PriceZone = { id: 'z', name: 'ภาคเหนือ', provinces: [], isDefault: false };
  const book: PriceBook = { id: 'b', zoneId: 'z', tier: 'M', basePricelistId: 1, entries: { '10': 100, '20': 200, '30': 300 }, typePercent: {}, status: 'DRAFT', submittedBy: null, approvedBy: null, updatedAt: '', publishedAt: null, lastDryRun: null };
  const item = (id: number, tmpl: number, price: number): PricelistItem => ({
    id, pricelistId: 5, appliedOn: '1_product', productTmplId: tmpl, productId: null, categId: null, minQuantity: 0, computePrice: 'fixed', fixedPrice: price,
    percentPrice: 0, priceDiscount: 0, priceSurcharge: 0, priceRound: 0, priceMinMargin: 0, priceMaxMargin: 0, base: 'list_price', basePricelistId: null, dateStart: null, dateEnd: null,
  });
  const names = new Map([[10, 'A'], [20, 'B'], [30, 'C'], [40, 'D']]);

  it('names the pricelist by zone and tier', async () => {
    expect(pricelistNameFor(zone, book)).toBe('WEB | ภาคเหนือ | M ดีลเลอร์กลาง');
  });

  it('creates everything when no target pricelist', async () => {
    const r = dryRunPublish(book, zone, { pricelistId: null, items: [] }, names);
    expect(r.create.map((c) => c.tmplId)).toEqual([10, 20, 30]);
    expect(r.update).toEqual([]);
    expect(r.unlink).toEqual([]);
  });

  it('classifies create / update / unchanged / unlink against existing items', async () => {
    const r = dryRunPublish(book, zone, { pricelistId: 5, items: [item(1, 10, 100), item(2, 20, 150), item(3, 40, 400)] }, names);
    expect(r.unchanged).toBe(1);
    expect(r.update).toEqual([{ tmplId: 20, name: 'B', from: 150, to: 200 }]);
    expect(r.create).toEqual([{ tmplId: 30, name: 'C', price: 300 }]);
    expect(r.unlink).toEqual([{ tmplId: 40, name: 'D', price: 400 }]);
  });
});

describe('customer groups', () => {
  it('creates, edits and de-duplicates a group', async () => {
    const group = (await store.upsertGroup({ name: 'เหนือ', brands: ['yk', 'YK'], categoryIds: [11, 11], includeTmplIds: [5], excludeTmplIds: [] }));
    expect(group.brands).toEqual(['YK']);
    expect(group.categoryIds).toEqual([11]);
    const edited = (await store.upsertGroup({ id: group.id, name: 'เหนือบน', brands: [], categoryIds: [], includeTmplIds: [], excludeTmplIds: [7] }));
    expect(edited.id).toBe(group.id);
    expect((await store.listGroups())).toHaveLength(1);
    expect((await store.getGroup(group.id))).toMatchObject({ name: 'เหนือบน', excludeTmplIds: [7] });
  });

  it('puts a dealer in one group at a time and frees members when the group is deleted', async () => {
    const a = (await store.upsertGroup({ name: 'A', brands: [], categoryIds: [], includeTmplIds: [], excludeTmplIds: [] }));
    const b = (await store.upsertGroup({ name: 'B', brands: [], categoryIds: [], includeTmplIds: [], excludeTmplIds: [] }));
    await store.setDealerGroup('d1', a.id);
    await store.setDealerGroup('d1', b.id);
    await store.setDealerGroup('d2', b.id);
    expect((await store.groupForDealer('d1'))?.id).toBe(b.id);
    expect((await store.groupMemberCounts()).get(b.id)).toBe(2);
    await store.setDealerGroup('d3', 'grp_missing');
    expect((await store.groupForDealer('d3'))).toBeUndefined();
    await store.deleteGroup(b.id);
    expect((await store.groupForDealer('d1'))).toBeUndefined();
    expect((await store.groupMemberCounts()).size).toBe(0);
  });
});
