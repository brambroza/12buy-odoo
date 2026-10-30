import { describe, expect, it } from 'vitest';
import { buildTasks, creditDues, dueLabel, percentChange, summarizeOrders, thaiDay } from '@/lib/admin/dashboard';

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
    expect(buildTasks({ ...base, orders: [order()], apiKeyDaysLeft: 90 })).toEqual([]);
  });

  it('warns admins about an Odoo API key that expires soon, urgent when days are few or it is past', () => {
    expect(buildTasks({ ...base, orders: [], apiKeyDaysLeft: 10 })).toEqual([expect.objectContaining({ id: 'api-key', priority: 'today', href: '/admin/settings', adminOnly: true })]);
    expect(buildTasks({ ...base, orders: [], apiKeyDaysLeft: -1 })[0]).toMatchObject({ priority: 'urgent', title: expect.stringContaining('หมดอายุแล้ว') });
    expect(buildTasks({ ...base, orders: [], apiKeyDaysLeft: null })).toEqual([]);
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

/** Credit order shipped and invoiced in Odoo with the given invoices. */
function invoiced(id: string, invoices: { name?: string; dueDate: string | null; amountResidual?: number; paymentState?: string }[], overrides: Partial<O> = {}): O {
  return order({
    id, ref: `WEB-${id}`, status: 'INVOICED', paymentMethod: 'CREDIT', ...overrides,
    odoo: {
      status: 'SYNCED', saleOrderId: 1, saleOrderName: 'S1', amountTotal: 1000, error: null, at: '2026-10-01T00:00:00Z',
      progress: { deliveryStatus: 'full', checkedAt: '2026-10-29T00:00:00Z', invoices: invoices.map((i, n) => ({ name: i.name ?? `INV/${id}/${n}`, paymentState: i.paymentState ?? 'not_paid', amountResidual: i.amountResidual ?? 1000, dueDate: i.dueDate })) },
    },
  });
}

const baseTasks = { newLeads: 0, pendingDealers: 0, booksPending: [], resetRequests: 0, publishedCarriers: 1, now: NOW };

describe('creditDues', () => {
  it('lists overdue and due-within-7-days unpaid credit invoices, soonest first, by Thai day', () => {
    const dues = creditDues([
      invoiced('a', [{ dueDate: '2026-11-03' }]),
      invoiced('b', [{ dueDate: '2026-10-27' }]),
      invoiced('c', [{ dueDate: '2026-10-29' }]),
      invoiced('d', [{ dueDate: '2026-11-06' }]),
    ], NOW);
    expect(dues.map((d) => [d.orderId, d.daysLeft])).toEqual([['b', -2], ['c', 0], ['a', 5]]);
  });

  it('skips cash, paid, cancelled, settled and not-yet-invoiced orders', () => {
    expect(creditDues([
      invoiced('cash', [{ dueDate: '2026-10-29' }], { paymentMethod: 'CASH' }),
      invoiced('paid', [{ dueDate: '2026-10-29' }], { status: 'PAID' }),
      invoiced('cancel', [{ dueDate: '2026-10-29' }], { status: 'CANCELLED' }),
      invoiced('zero', [{ dueDate: '2026-10-29', amountResidual: 0 }]),
      invoiced('inpay', [{ dueDate: '2026-10-29', paymentState: 'in_payment' }]),
      invoiced('nodate', [{ dueDate: null }]),
      order({ id: 'nosync', status: 'SHIPPED' }),
    ], NOW)).toEqual([]);
  });

  it('labels days left in Thai', () => {
    expect(dueLabel(-3)).toBe('เลยกำหนด 3 วัน');
    expect(dueLabel(0)).toBe('ครบกำหนดวันนี้');
    expect(dueLabel(2)).toBe('อีก 2 วัน');
  });
});

describe('buildTasks credit payments reported by dealers', () => {
  const credits = (uploadedAt: string, status: 'PENDING' | 'VERIFIED' = 'PENDING') => ({ slipFile: null, slipUploadedAt: null, verifiedAt: null, credits: [{ id: 'p', slipFile: 'x-1.jpg', amount: 1500, note: '', uploadedAt, status, reviewedAt: null }] });

  it('lists unchecked transfers as today work, linking to the single order', () => {
    const tasks = buildTasks({ ...baseTasks, orders: [order({ id: 'k1', ref: 'WEB-K', status: 'INVOICED', payment: credits('2026-10-29T02:30:00Z') })] });
    const task = tasks.find((t) => t.id === 'credit-payment');
    expect(task).toMatchObject({ priority: 'today', count: 1, href: '/admin/orders?open=k1' });
    expect(task?.detail).toContain('WEB-K');
    expect(task?.detail).toContain('1,500');
  });

  it('is urgent after 2 hours, counts every pending transfer and ignores checked, cancelled ones', () => {
    const tasks = buildTasks({ ...baseTasks, orders: [
      order({ id: 'k1', status: 'INVOICED', payment: credits('2026-10-28T20:00:00Z') }),
      order({ id: 'k2', status: 'SHIPPED', payment: credits('2026-10-29T02:30:00Z') }),
      order({ id: 'k3', status: 'INVOICED', payment: credits('2026-10-29T02:30:00Z', 'VERIFIED') }),
      order({ id: 'k4', status: 'CANCELLED', payment: credits('2026-10-29T02:30:00Z') }),
    ] });
    expect(tasks.find((t) => t.id === 'credit-payment')).toMatchObject({ priority: 'urgent', count: 2, href: '/admin/orders?pay=pending' });
  });
});

describe('buildTasks credit reminders', () => {
  it('adds an urgent overdue task and a due-soon task linking to the filtered orders', () => {
    const tasks = buildTasks({ ...baseTasks, orders: [
      invoiced('a', [{ dueDate: '2026-10-28', amountResidual: 1500 }]),
      invoiced('b', [{ dueDate: '2026-10-25', amountResidual: 500 }]),
      invoiced('c', [{ dueDate: '2026-10-31' }]),
    ] });
    const overdue = tasks.find((t) => t.id === 'credit-overdue');
    expect(overdue).toMatchObject({ priority: 'urgent', count: 2, href: '/admin/orders?due=overdue' });
    expect(overdue?.detail).toContain('เลยกำหนด 4 วัน');
    expect(tasks.find((t) => t.id === 'credit-due-soon')).toMatchObject({ priority: 'today', count: 1, href: '/admin/orders?open=c' });
    expect(tasks[0].priority).toBe('urgent');
  });

  it('makes a reminder more than 3 days out a follow-up', () => {
    const tasks = buildTasks({ ...baseTasks, orders: [invoiced('a', [{ dueDate: '2026-11-04' }])] });
    expect(tasks).toEqual([expect.objectContaining({ id: 'credit-due-soon', priority: 'soon' })]);
  });
});
