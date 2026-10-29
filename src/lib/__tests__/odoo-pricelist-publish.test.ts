import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceBook, PriceZone } from '@/lib/admin/types';
import type { PricelistItem } from '@/lib/shop/price-engine';
import type { CatalogProduct } from '@/lib/shop/types';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooWrite: vi.fn(), odooWritesEnabled: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);
const { desiredItems, planSync, publishBookToOdoo } = await import('@/lib/odoo/pricelist-publish');

const book = (patch: Partial<PriceBook> = {}): PriceBook => ({
  id: 'b', zoneId: 'z', tier: 'M', basePricelistId: 9, entries: { '777': 2400 }, typePercent: { TRUCK: 5 }, status: 'PUBLISHED',
  submittedBy: 'a', approvedBy: 'b', updatedAt: '', publishedAt: null, lastDryRun: null, ...patch,
});
const zone: PriceZone = { id: 'z', name: 'เหนือ', provinces: [], isDefault: false };
const products = [
  { categoryId: 11, dealerType: 'CAR' },
  { categoryId: 21, dealerType: 'TRUCK' },
  { categoryId: 22, dealerType: 'TRUCK' },
] as CatalogProduct[];

const item = (patch: Partial<PricelistItem>): PricelistItem => ({
  id: 1, pricelistId: 50, appliedOn: '1_product', productTmplId: 777, productId: null, categId: null, minQuantity: 0, computePrice: 'fixed', fixedPrice: 2400,
  percentPrice: 0, priceDiscount: 0, priceSurcharge: 0, priceRound: 0, priceMinMargin: 0, priceMaxMargin: 0, base: 'list_price', basePricelistId: null, dateStart: null, dateEnd: null, ...patch,
});

describe('desiredItems', () => {
  it('has a fixed item per entry, a formula per category with a % and a global fallback', () => {
    const items = desiredItems(book(), products);
    expect(items.map((i) => i.key)).toEqual(['p:777', 'c:21', 'c:22', 'g']);
    expect(items[0].values).toMatchObject({ applied_on: '1_product', product_tmpl_id: 777, compute_price: 'fixed', fixed_price: 2400 });
    expect(items[1].values).toMatchObject({ applied_on: '2_product_category', categ_id: 21, base: 'pricelist', base_pricelist_id: 9, price_discount: -5 });
    expect(items[3].values).toMatchObject({ applied_on: '3_global', base_pricelist_id: 9, price_discount: 0 });
  });
});

describe('planSync', () => {
  it('creates everything on an empty pricelist', () => {
    const plan = planSync(desiredItems(book(), products), []);
    expect(plan.create).toHaveLength(4);
    expect(plan.update).toEqual([]);
    expect(plan.unlink).toEqual([]);
  });

  it('updates changed prices, keeps equal ones and removes items the web did not make or no longer wants', () => {
    const existing = [
      item({ id: 1 }),
      item({ id: 2, productTmplId: 888, fixedPrice: 100 }),
      item({ id: 3, appliedOn: '2_product_category', productTmplId: null, categId: 21, computePrice: 'formula', base: 'pricelist', basePricelistId: 9, priceDiscount: -3 }),
      item({ id: 4, minQuantity: 10 }),
      item({ id: 5 }),
    ];
    const plan = planSync(desiredItems(book(), products), existing);
    expect(plan.update).toEqual([{ id: 3, values: expect.objectContaining({ price_discount: -5 }) }]);
    expect(plan.unlink.sort()).toEqual([2, 4, 5]);
    expect(plan.create.map((v) => v.applied_on)).toEqual(['2_product_category', '3_global']);
  });
});

describe('publishBookToOdoo', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.resetAllMocks());

  it('skips without any call when Odoo writes are off', async () => {
    rpc.odooWritesEnabled.mockReturnValue(false);
    expect(await publishBookToOdoo(book(), zone, products)).toMatchObject({ status: 'SKIPPED' });
    expect(rpc.odooSearchRead).not.toHaveBeenCalled();
    expect(rpc.odooWrite).not.toHaveBeenCalled();
  });

  it('creates the pricelist on first publish and writes its items', async () => {
    rpc.odooWritesEnabled.mockReturnValue(true);
    rpc.odooWrite.mockResolvedValueOnce([50]).mockResolvedValueOnce([1, 2, 3, 4]);
    rpc.odooSearchRead.mockResolvedValueOnce([]);
    const outcome = await publishBookToOdoo(book(), zone, products);
    expect(rpc.odooWrite.mock.calls[0]).toEqual(['product.pricelist', 'create', [[{ name: 'WEB | เหนือ | M ดีลเลอร์กลาง' }]]]);
    expect(rpc.odooWrite.mock.calls[1][0]).toBe('product.pricelist.item');
    expect(rpc.odooWrite.mock.calls[1][2][0].every((v: { pricelist_id: number }) => v.pricelist_id === 50)).toBe(true);
    expect(outcome).toMatchObject({ status: 'DONE', pricelistId: 50, created: 4 });
  });

  it('refuses to write into its own base pricelist and reports the error', async () => {
    rpc.odooWritesEnabled.mockReturnValue(true);
    expect(await publishBookToOdoo(book({ odooPricelistId: 9 }), zone, products)).toMatchObject({ status: 'FAILED' });
    expect(rpc.odooWrite).not.toHaveBeenCalled();
  });

  it('keeps the created pricelist id when a later step fails, so a retry reuses it', async () => {
    rpc.odooWritesEnabled.mockReturnValue(true);
    rpc.odooWrite.mockResolvedValueOnce(50);
    rpc.odooSearchRead.mockRejectedValueOnce(new Error('Odoo HTTP 502'));
    expect(await publishBookToOdoo(book(), zone, products)).toMatchObject({ status: 'FAILED', pricelistId: 50, error: 'Odoo HTTP 502' });
  });
});
