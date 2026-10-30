import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin/store', () => ({ listBooks: vi.fn(async () => []), listZones: vi.fn(async () => []) }));
vi.mock('@/lib/auth/reset-requests', () => ({ listPendingResetRequests: vi.fn(async () => [{ id: 'r1' }]) }));
vi.mock('@/lib/dealers/repo', () => ({ listDealers: vi.fn(async () => [{ id: 'd1' }, { id: 'd2' }]) }));
vi.mock('@/lib/leads/repo', () => ({ listLeads: vi.fn(async () => { throw new Error('db down'); }) }));
vi.mock('@/lib/shop/store', () => ({ listAllOrders: vi.fn(async () => []) }));

const { bellBadge, loadBell } = await import('@/lib/admin/notifications');

describe('bellBadge', () => {
  it('counts urgent and today items, not follow-ups', () => {
    expect(bellBadge([{ priority: 'urgent', count: 2 }, { priority: 'today', count: 3 }, { priority: 'soon', count: 9 }])).toBe(5);
  });

  it('counts an item without a number as one', () => {
    expect(bellBadge([{ priority: 'urgent', count: 0 }])).toBe(1);
    expect(bellBadge([])).toBe(0);
  });
});

describe('loadBell', () => {
  it('shows admin-only items to admins and survives a failing source', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = await loadBell('ADMIN');
    expect(data.items.map((i) => i.id).sort()).toEqual(['dealers', 'reset-requests']);
    expect(data.badge).toBe(3);
    errorSpy.mockRestore();
  });

  it('hides admin-only items from sales', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = await loadBell('SALES');
    expect(data.items.map((i) => i.id)).toEqual(['dealers']);
    expect(data.badge).toBe(2);
    errorSpy.mockRestore();
  });
});
