import { describe, expect, it } from 'vitest';
import type { PriceBook } from '@/lib/admin/types';
import type { Catalog } from '../catalog';
import { billTotals, cashDiscountPerUnit, orderPricelistId, priceFromBook, resolvePrice, vatLabel, withCoupon } from '../pricing';
import { vatFromTaxes } from '../catalog';
import type { CatalogProduct, DealerProfile } from '../types';
import type { PricelistItem } from '../price-engine';

const product: CatalogProduct = { id: 779, tmplId: 777, name: 'ยาง 195/65R15', code: 'YK', listPrice: 2550, categoryId: 11, categoryName: 'YK-PCR', brand: 'YK', dealerType: 'CAR', size: null, qtyAvailable: 5, imageUrl: null, baseUnit: 'เส้น', units: [{ id: 1, name: 'เส้น', factor: 1 }], vatRate: 7, vatIncluded: true };
const fixed: PricelistItem = { id: 1, pricelistId: 9, appliedOn: '1_product', productTmplId: 777, productId: null, categId: null, minQuantity: 0, computePrice: 'fixed', fixedPrice: 2400, percentPrice: 0, priceDiscount: 0, priceSurcharge: 0, priceRound: 0, priceMinMargin: 0, priceMaxMargin: 0, base: 'list_price', basePricelistId: null, dateStart: null, dateEnd: null };
const catalog: Catalog = { products: [product], pricelists: [], priceCtx: { itemsByPricelist: new Map([[9, [fixed]]]), categoryParents: new Map() }, loadedAt: new Date() };
const profile: DealerProfile = { dealerId: null, name: 'x', types: ['CAR'], tier: 'M', province: 'กรุงเทพมหานคร', pricelistId: 9, address: '', shipping: null, phone: '', priceBookId: null, odooPartnerId: null, credit: false, cashPricelistId: null, customerGroupId: null, avatarFile: null };
const book = (patch: Partial<PriceBook>): PriceBook => ({ id: 'b', zoneId: 'z', tier: 'M', basePricelistId: 9, entries: {}, typePercent: {}, status: 'PUBLISHED', submittedBy: null, approvedBy: null, updatedAt: '', publishedAt: null, lastDryRun: null, ...patch });

describe('resolvePrice', () => {
  it('uses the Odoo pricelist when no book', () => {
    expect(resolvePrice(catalog, product, profile, 1, null)).toBe(2400);
  });
  it('ignores draft books', () => {
    expect(resolvePrice(catalog, product, profile, 1, book({ status: 'DRAFT', entries: { '777': 1 } }))).toBe(2400);
  });
  it('fixed entry wins', () => {
    expect(resolvePrice(catalog, product, profile, 1, book({ entries: { '777': 2300 }, typePercent: { CAR: 50 } }))).toBe(2300);
  });
  it('applies type percent over the base pricelist price', () => {
    expect(priceFromBook(catalog, product, book({ typePercent: { CAR: 5 } }))).toBe(2520);
    expect(priceFromBook(catalog, product, book({ typePercent: { TRUCK: 5 } }))).toBe(2400);
  });
  it('falls back to list price when base pricelist has no rule', () => {
    expect(priceFromBook(catalog, product, book({ basePricelistId: 1 }))).toBe(2550);
  });
});

describe('cash discount for credit dealers', () => {
  const credit: PricelistItem = { ...fixed, id: 2, pricelistId: 7, fixedPrice: 2500 };
  const cash: PricelistItem = { ...fixed, id: 3, pricelistId: 8, fixedPrice: 2380 };
  const ctxCatalog: Catalog = { ...catalog, priceCtx: { itemsByPricelist: new Map([[7, [credit]], [8, [cash]]]), categoryParents: new Map() } };
  const creditDealer: DealerProfile = { ...profile, pricelistId: 7, credit: true, cashPricelistId: 8 };

  it('is the credit − cash price difference per unit', () => {
    expect(cashDiscountPerUnit(ctxCatalog, product, creditDealer)).toBe(120);
  });
  it('is zero for non-credit dealers or without a paired cash pricelist', () => {
    expect(cashDiscountPerUnit(ctxCatalog, product, { ...creditDealer, credit: false })).toBe(0);
    expect(cashDiscountPerUnit(ctxCatalog, product, { ...creditDealer, cashPricelistId: null })).toBe(0);
  });
  it('never goes negative when cash is dearer than credit', () => {
    expect(cashDiscountPerUnit(ctxCatalog, product, { ...creditDealer, pricelistId: 8, cashPricelistId: 7 })).toBe(0);
  });
  it('never exceeds the price the dealer sees', () => {
    expect(cashDiscountPerUnit(ctxCatalog, product, creditDealer, 1, 100)).toBe(100);
  });
});

describe('pricelist per product family', () => {
  const big: PricelistItem = { ...fixed, id: 4, pricelistId: 20, fixedPrice: 2100 };
  const bigCash: PricelistItem = { ...fixed, id: 5, pricelistId: 21, fixedPrice: 2000 };
  const familyCatalog: Catalog = { ...catalog, priceCtx: { itemsByPricelist: new Map([[9, [fixed]], [20, [big]], [21, [bigCash]]]), categoryParents: new Map() } };
  const motorcycle: CatalogProduct = { ...product, id: 800, dealerType: 'MOTORCYCLE' };

  it('prices a family from its own pricelist and leaves other families alone', () => {
    const goalong: DealerProfile = { ...profile, types: ['CAR', 'MOTORCYCLE'], typePricelists: { CAR: 20 } };
    expect(resolvePrice(familyCatalog, product, goalong)).toBe(2100);
    expect(resolvePrice(familyCatalog, motorcycle, goalong)).toBe(2400); // dealer pricelist 9
  });
  it('wins over a published web price book', () => {
    const withBook: DealerProfile = { ...profile, typePricelists: { CAR: 20 }, priceBook: book({ entries: { '777': 2300 } }) };
    expect(resolvePrice(familyCatalog, product, withBook)).toBe(2100);
    expect(resolvePrice(familyCatalog, product, { ...withBook, typePricelists: {} })).toBe(2300);
  });
  it('gives credit dealers the cash discount of the family pricelist pair', () => {
    const creditDealer: DealerProfile = { ...profile, credit: true, pricelistId: 9, cashPricelistId: null, typePricelists: { CAR: 20 }, typeCashPricelists: { CAR: 21 } };
    expect(cashDiscountPerUnit(familyCatalog, product, creditDealer)).toBe(100);
    expect(cashDiscountPerUnit(familyCatalog, product, { ...creditDealer, typeCashPricelists: {} })).toBe(0);
    expect(cashDiscountPerUnit(familyCatalog, product, { ...creditDealer, cashPricelistId: 21, typeCashPricelists: {} })).toBe(0);
  });
});

describe('billTotals', () => {
  const lines = [{ qty: 4, unitPrice: 2500, cashDiscountPerUnit: 120 }, { qty: 2, unitPrice: 999.99, cashDiscountPerUnit: 0.335 }];
  it('applies the discount once at the end of the bill when paying cash', () => {
    expect(billTotals(lines, 'CASH')).toMatchObject({ subtotal: 11999.98, cashDiscount: 480.67, vatAdded: 0, vat: 0, total: 11519.31 });
  });
  it('charges the full credit price on credit', () => {
    expect(billTotals(lines, 'CREDIT')).toMatchObject({ subtotal: 11999.98, cashDiscount: 0, vatAdded: 0, total: 11999.98 });
  });
  it('treats missing per-unit discount as zero', () => {
    expect(billTotals([{ qty: 1, unitPrice: 50 }], 'CASH')).toMatchObject({ subtotal: 50, cashDiscount: 0, total: 50 });
  });
});

describe('withCoupon', () => {
  it('takes the coupon off the total and never goes below zero', () => {
    expect(withCoupon({ subtotal: 1000, cashDiscount: 100, total: 900 }, 50)).toEqual({ subtotal: 1000, cashDiscount: 100, couponDiscount: 50, total: 850 });
    expect(withCoupon({ subtotal: 100, cashDiscount: 0, total: 100 }, 500)).toMatchObject({ couponDiscount: 100, total: 0 });
    expect(withCoupon({ subtotal: 100, cashDiscount: 0, total: 100 }, -5)).toMatchObject({ couponDiscount: 0, total: 100 });
  });
});

describe('orderPricelistId', () => {
  it('uses the dealer pricelist when no published book was written to Odoo', () => {
    expect(orderPricelistId(profile)).toBe(9);
    expect(orderPricelistId({ ...profile, priceBook: null })).toBe(9);
    const book = { status: 'PUBLISHED', odooPricelistId: 55 } as PriceBook;
    expect(orderPricelistId({ ...profile, priceBook: book })).toBe(55);
  });
});

describe('VAT', () => {
  it('keeps VAT-included prices as the amount due and reports the VAT inside', () => {
    const bill = billTotals([{ qty: 4, unitPrice: 2140, vatRate: 7, vatIncluded: true }], 'CREDIT');
    expect(bill).toEqual({ subtotal: 8560, cashDiscount: 0, vatAdded: 0, vat: 560, total: 8560 });
  });

  it('adds VAT on top of products whose Odoo tax is not price-included, after the cash discount', () => {
    const lines = [
      { qty: 4, unitPrice: 2140, vatRate: 7, vatIncluded: true },
      { qty: 2, unitPrice: 1000, cashDiscountPerUnit: 100, vatRate: 7, vatIncluded: false },
    ];
    expect(billTotals(lines, 'CASH')).toEqual({ subtotal: 10560, cashDiscount: 200, vatAdded: 126, vat: 686, total: 10486 });
    expect(billTotals(lines, 'CREDIT')).toMatchObject({ vatAdded: 140, total: 10700 });
  });

  it('shrinks the VAT inside in proportion to a coupon', () => {
    const bill = withCoupon(billTotals([{ qty: 1, unitPrice: 1070, vatRate: 7, vatIncluded: true }], 'CASH'), 107);
    expect(bill).toMatchObject({ total: 963, couponDiscount: 107, vat: 63 });
  });

  it('reads the rate and inclusion from Odoo sale taxes, ignoring withholding', () => {
    const taxes = new Map([
      [53, { id: 53, amount: 7, amount_type: 'percent', price_include: true }],
      [6, { id: 6, amount: 7, amount_type: 'percent', price_include: false }],
      [23, { id: 23, amount: -3, amount_type: 'percent', price_include: false }],
    ]);
    expect(vatFromTaxes([53], taxes)).toEqual({ vatRate: 7, vatIncluded: true });
    expect(vatFromTaxes([6, 23], taxes)).toEqual({ vatRate: 7, vatIncluded: false });
    expect(vatFromTaxes([], taxes)).toEqual({ vatRate: 0, vatIncluded: true });
    expect(vatLabel({ vatRate: 7, vatIncluded: true })).toBe('รวม VAT');
    expect(vatLabel({ vatRate: 7, vatIncluded: false })).toBe('+VAT 7%');
    expect(vatLabel({ vatRate: 0, vatIncluded: true })).toBe('');
  });
});
