import { describe, expect, it } from 'vitest';
import { byDealer, byMonth, byProduct, dailySeries, ordersInRange, rangeTotals, resolveRange } from '@/lib/admin/reports';
import type { ProtoOrder } from '@/lib/shop/types';

const NOW = Date.parse('2026-10-30T05:00:00Z'); // 12:00 Bangkok
const order = (id: string, at: string, total: number, extra: Partial<ProtoOrder> = {}): ProtoOrder => ({
  id, ref: `WEB-${id}`, sessionId: 'dealer:d1', dealerName: 'ร้าน A', status: 'PREPARING', lines: [{ productId: 1, name: 'P1', code: 'C1', size: '195/65R15', qty: 2, unitPrice: total / 2 }],
  subtotal: total, cashDiscount: 0, couponDiscount: 0, total, paymentMethod: 'CASH', address: '', carrier: '', note: '', trackingRef: null,
  payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null }, createdAt: at, events: [], ...extra,
} as ProtoOrder);

describe('resolveRange', () => {
  it('maps quick keys to Bangkok calendar days', () => {
    expect(resolveRange({ range: 'today' }, NOW).range).toEqual({ from: '2026-10-30', to: '2026-10-30' });
    expect(resolveRange({ range: '7d' }, NOW).range).toEqual({ from: '2026-10-24', to: '2026-10-30' });
    expect(resolveRange({ range: 'month' }, NOW).range).toEqual({ from: '2026-10-01', to: '2026-10-30' });
    expect(resolveRange({ range: 'lastMonth' }, NOW).range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(resolveRange({}, NOW).key).toBe('month');
  });
  it('accepts custom dates and swaps a reversed pair', () => {
    expect(resolveRange({ from: '2026-10-20', to: '2026-10-10' }, NOW)).toEqual({ key: 'custom', range: { from: '2026-10-10', to: '2026-10-20' } });
    expect(resolveRange({ range: 'custom', from: 'bad' }, NOW).range.from).toBe('2026-10-01');
  });
});

describe('grouping', () => {
  const orders = [
    order('1', '2026-10-29T03:00:00Z', 1000),
    order('2', '2026-10-30T03:00:00Z', 2000, { dealerName: 'ร้าน B', status: 'PAID', paymentMethod: 'CREDIT' }),
    order('3', '2026-09-15T03:00:00Z', 500),
    order('4', '2026-10-30T03:00:00Z', 999, { status: 'CANCELLED' }),
  ];
  it('drops cancelled orders and filters by day', () => {
    const inRange = ordersInRange(orders, { from: '2026-10-01', to: '2026-10-31' });
    expect(inRange.map((o) => o.id)).toEqual(['1', '2']);
    const totals = rangeTotals(inRange);
    expect(totals).toMatchObject({ orders: 2, sales: 3000, paid: 2000, outstanding: 1000, cash: 1000, credit: 2000, avgOrder: 1500, dealers: 2, units: 4 });
  });
  it('groups by dealer with shares, by product and by month', () => {
    const dealers = byDealer(ordersInRange(orders, { from: '2026-10-01', to: '2026-10-31' }));
    expect(dealers[0]).toMatchObject({ label: 'ร้าน B', sales: 2000, share: 66.67 });
    expect(byProduct(orders.slice(0, 2))[0]).toMatchObject({ key: 'C1', units: 4, sales: 3000 });
    expect(byMonth(orders.filter((o) => o.status !== 'CANCELLED')).map((m) => [m.key, m.sales])).toEqual([['2026-09', 500], ['2026-10', 3000]]);
  });
  it('fills every day of the series', () => {
    const series = dailySeries(orders.slice(0, 2), { from: '2026-10-28', to: '2026-10-30' });
    expect(series.map((d) => [d.day, d.sales])).toEqual([['2026-10-28', 0], ['2026-10-29', 1000], ['2026-10-30', 2000]]);
  });
});
