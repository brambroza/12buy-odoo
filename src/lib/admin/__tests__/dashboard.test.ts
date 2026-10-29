import { describe, expect, it } from 'vitest';
import { buildTasks, percentChange, summarizeOrders, thaiDay } from '@/lib/admin/dashboard';

// 2026-10-29 10:00 in Bangkok (03:00 UTC).
const NOW = Date.parse('2026-10-29T03:00:00Z');

type O = Parameters<typeof summarizeOrders>[0][number];
function order(overrides: Partial<O> = {}): O {
  return {
    id: 'o1', ref: 'WEB-1', dealerName: 'ร้าน ก', status: 'PAID', total: 1000, createdAt: '2026-10-29T02:00:00Z', paymentMethod: 'CREDIT',
    payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null }, odoo: undefined, ...overrides,
  };
}

describe('thaiDay', () => {
  it('uses the Bangkok calendar day', () => {
    expect(thaiDay('2026-10-28T18:00:00Z')).toBe('2026-10-29');
    expect(thaiDay('2026-10-28T16:00:00Z')).toBe('2026-10-28');
  });
});

describe('summarizeOrders', () => {
  it('totals sales, today, month, last month and statuses without cancelled orders', () => {
    const s = summarizeOrders([
      order(),
      order({ id: 'o2', status: 'PENDING', total: 500, dealerName: 'ร้าน ข' }),
      order({ id: 'o3', status: 'CANCELLED', total: 9999 }),
      order({ id: 'o4', total: 300, createdAt: '2026-10-01T05:00:00Z' }),
      order({ id: 'o5', total: 200, createdAt: '2026-09-15T05:00:00Z' }),
    ], NOW);
    expect(s).toMatchObject({ orders: 4, sales: 2000, paid: 1500, today: { orders: 2, sales: 1500 }, month: { orders: 3, sales: 1800 }, lastMonth: { orders: 1, sales: 200 } });
    expect(s.byStatus).toMatchObject({ PAID: 3, PENDING: 1, CANCELLED: 1 });
    expect(s.topDealers[0]).toEqual({ name: 'ร้าน ก', orders: 2, sales: 1300 });
    expect(s.daily).toHaveLength(14);
    expect(s.daily.at(-1)).toEqual({ day: '2026-10-29', orders: 2, sales: 1500 });
  });

  it('handles no orders', () => {
    expect(summarizeOrders([], NOW)).toMatchObject({ orders: 0, sales: 0, topDealers: [] });
  });
});

describe('percentChange', () => {
  it('compares to the base and returns null without one', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe('buildTasks', () => {
  const base = { newLeads: 0, pendingDealers: 0, booksPending: [], resetRequests: 0, publishedCarriers: 1, now: NOW };

  it('is empty when nothing waits', () => {
    expect(buildTasks({ ...base, orders: [order()] })).toEqual([]);
  });

  it('lists order work, linking straight to a single order', () => {
    const tasks = buildTasks({ ...base, orders: [
      order({ id: 's1', ref: 'WEB-S', status: 'PENDING', paymentMethod: 'CASH', payment: { slipFile: 'a.jpg', slipUploadedAt: null, verifiedAt: null } }),
      order({ id: 'c1', status: 'PENDING', paymentMethod: 'CREDIT' }),
      order({ id: 'c2', status: 'PENDING', paymentMethod: 'CREDIT' }),
      order({ id: 'w1', status: 'PENDING', paymentMethod: 'CASH' }),
    ] });
    expect(tasks.map((t) => t.id)).toEqual(['check-slip', 'confirm-orders', 'waiting-slip']);
    expect(tasks[0]).toMatchObject({ count: 1, href: '/admin/orders?open=s1' });
    expect(tasks[1]).toMatchObject({ count: 2, href: '/admin/orders?status=PENDING' });
  });

  it('marks stale orders, Odoo failures and missing carriers urgent and puts them first', () => {
    const tasks = buildTasks({ ...base, publishedCarriers: 0, newLeads: 2, orders: [
      order({ id: 'c1', status: 'PENDING', createdAt: '2026-10-28T20:00:00Z' }),
      order({ id: 'f1', status: 'PREPARING', odoo: { status: 'FAILED', saleOrderId: null, saleOrderName: null, amountTotal: null, error: 'x', at: '' } }),
    ] });
    expect(tasks.slice(0, 3).map((t) => [t.id, t.priority])).toEqual([['odoo-sync', 'urgent'], ['confirm-orders', 'urgent'], ['carriers', 'urgent']]);
    expect(tasks.find((t) => t.id === 'leads')).toMatchObject({ priority: 'today', href: '/admin/leads?status=NEW' });
  });

  it('adds approvals and admin-only work', () => {
    const tasks = buildTasks({ ...base, orders: [], pendingDealers: 1, booksPending: [{ id: 'b1', label: 'ภาคเหนือ · M' }], resetRequests: 2, newLeads: 1, oldestNewLeadAt: '2026-10-27T00:00:00Z' });
    expect(tasks.find((t) => t.id === 'leads')?.priority).toBe('urgent');
    expect(tasks.find((t) => t.id === 'price-books')).toMatchObject({ href: '/admin/prices?book=b1', adminOnly: true });
    expect(tasks.find((t) => t.id === 'reset-requests')).toMatchObject({ count: 2, adminOnly: true });
    expect(tasks.find((t) => t.id === 'dealers')?.href).toBe('/admin/dealers?status=PENDING');
  });
});
