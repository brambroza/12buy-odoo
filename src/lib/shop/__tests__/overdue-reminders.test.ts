import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dealers/repo', () => ({ listDealers: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyDealer: vi.fn(), notifyStaffGroup: vi.fn() }));
vi.mock('@/lib/notify/repo', () => ({ listNotifications: vi.fn() }));
vi.mock('../credit-line', () => ({ getCreditSummary: vi.fn() }));

import { listDealers } from '@/lib/dealers/repo';
import { notifyDealer, notifyStaffGroup } from '@/lib/notify';
import { listNotifications } from '@/lib/notify/repo';
import type { OverdueSummary } from '../credit';
import { getCreditSummary } from '../credit-line';
import { reminderKind, reminderText, runOverdueReminders } from '../overdue-reminders';

const base: OverdueSummary = { amount: 0, count: 0, oldestDueDate: null, source: 'odoo', graceDays: 10, grace: null };
const inGrace = (lockDate: string): OverdueSummary => ({ ...base, grace: { amount: 8_000, count: 1, lockDate } });
const locked = (oldestDueDate: string): OverdueSummary => ({ ...base, amount: 8_000, count: 1, oldestDueDate });

describe('reminderKind', () => {
  // Due 2026-11-05, grace 10 → in grace 6–15 Nov, lock date 16 Nov.
  it('fires on the first day past due, 3 and 1 days before the lock, and on the lock day', () => {
    expect(reminderKind(inGrace('2026-11-16'), '2026-11-06')).toBe('grace-start');
    expect(reminderKind(inGrace('2026-11-16'), '2026-11-07')).toBeNull();
    expect(reminderKind(inGrace('2026-11-16'), '2026-11-13')).toBe('grace-3d');
    expect(reminderKind(inGrace('2026-11-16'), '2026-11-15')).toBe('grace-1d');
    expect(reminderKind(locked('2026-11-05'), '2026-11-16')).toBe('locked');
    expect(reminderKind(locked('2026-11-05'), '2026-11-17')).toBeNull();
  });
  it('is quiet when nothing is past due', () => {
    expect(reminderKind(null, '2026-11-06')).toBeNull();
    expect(reminderKind(base, '2026-11-06')).toBeNull();
  });
  it('with 0 grace days the lock reminder is the day after the due date', () => {
    expect(reminderKind({ ...locked('2026-11-05'), graceDays: 0 }, '2026-11-06')).toBe('locked');
  });
});

describe('reminderText', () => {
  it('names the lock date while in grace and says credit is closed once locked', () => {
    expect(reminderText('grace-start', inGrace('2026-11-16'))).toMatchObject({ title: 'ใบแจ้งหนี้เลยกำหนดชำระ' });
    expect(reminderText('grace-3d', inGrace('2026-11-16')).body).toContain('16 พ.ย. 2569');
    expect(reminderText('grace-1d', inGrace('2026-11-16')).title).toBe('พรุ่งนี้ระบบจะปิดสั่งเครดิต');
    expect(reminderText('locked', locked('2026-11-05'))).toMatchObject({ title: 'ปิดการสั่งซื้อแบบเครดิตชั่วคราว' });
  });
});

describe('runOverdueReminders', () => {
  const dealers = [
    { id: 'd1', name: 'ดรีมเมคเกอร์', creditEnabled: true, odooPartnerId: 42 },
    { id: 'd2', name: 'ร้านสอง', creditEnabled: true, odooPartnerId: 43 },
    { id: 'd3', name: 'เงินสด', creditEnabled: false, odooPartnerId: 44 },
  ];
  const at = Date.parse('2026-11-06T02:00:00Z'); // 09:00 Thai, 6 Nov

  it('notifies only on milestone days, once per day, and posts one staff summary', async () => {
    vi.mocked(listDealers).mockResolvedValue(dealers as never);
    vi.mocked(getCreditSummary).mockImplementation(async ({ dealerId }) => ({
      line: null, odooReceivable: null, openInvoices: null,
      overdue: dealerId === 'd1' ? inGrace('2026-11-16') : locked('2026-10-20'),
    }));
    vi.mocked(listNotifications).mockResolvedValue([]);
    const run = await runOverdueReminders(at);
    expect(listDealers).toHaveBeenCalledWith({ status: 'ACTIVE' });
    expect(run).toEqual({ dealers: 2, inGrace: 1, locked: 1, notified: 1, failed: 0 });
    expect(notifyDealer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyDealer).mock.calls[0][0]).toMatchObject({ dealerId: 'd1', type: 'credit.grace-start', href: '/shop/account' });
    expect(notifyStaffGroup).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyStaffGroup).mock.calls[0][0].rows).toHaveLength(2);
  });

  it('skips a reminder already sent today and counts failures without stopping', async () => {
    vi.mocked(notifyDealer).mockClear();
    vi.mocked(notifyStaffGroup).mockClear();
    vi.mocked(listDealers).mockResolvedValue(dealers as never);
    vi.mocked(getCreditSummary).mockImplementation(async ({ dealerId }) => {
      if (dealerId === 'd2') throw new Error('odoo down');
      return { line: null, odooReceivable: null, openInvoices: null, overdue: inGrace('2026-11-16') };
    });
    vi.mocked(listNotifications).mockResolvedValue([{ type: 'credit.grace-start', createdAt: '2026-11-06T01:00:00Z' }] as never);
    const run = await runOverdueReminders(at);
    expect(run).toEqual({ dealers: 2, inGrace: 1, locked: 0, notified: 0, failed: 1 });
    expect(notifyDealer).not.toHaveBeenCalled();
    expect(notifyStaffGroup).toHaveBeenCalledTimes(1);
  });
});
