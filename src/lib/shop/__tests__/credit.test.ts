import { describe, expect, it } from 'vitest';
import { addDays, creditAfterOrder, daysBetween, isDealerScope, isInGrace, isOverdueLocked, orderCreditView, overdueFromInvoices, overdueFromWebOrders, overdueGraceMessage, overdueLockMessage, parseOrderScope, thaiDate, tightestCredit, webCreditLine, webCreditUsed } from '../credit';

describe('creditAfterOrder', () => {
  it('is the limit minus what is owed minus this order', () => {
    expect(creditAfterOrder({ limit: 50_000, used: 30_000 }, 4_500.5)).toEqual({ remaining: 15_499.5, over: false });
  });
  it('flags an order that goes over the limit', () => {
    expect(creditAfterOrder({ limit: 50_000, used: 48_000 }, 2_000.01)).toEqual({ remaining: -0.01, over: true });
  });
  it('allows an order that uses the limit exactly', () => {
    expect(creditAfterOrder({ limit: 10_000, used: 0 }, 10_000).over).toBe(false);
  });
  it('never blocks without a limit or without Odoo data', () => {
    expect(creditAfterOrder({ limit: null, used: 99_999 }, 1_000)).toEqual({ remaining: null, over: false });
    expect(creditAfterOrder(null, 1_000)).toEqual({ remaining: null, over: false });
  });
});

describe('tightestCredit', () => {
  it('picks the line with the least room left', () => {
    const web = { limit: 100_000, used: 90_000 };
    const odoo = { limit: 50_000, used: 20_000 };
    expect(tightestCredit(web, odoo)).toBe(web);
    expect(tightestCredit(odoo, { limit: 10_000, used: 0 })).toEqual({ limit: 10_000, used: 0 });
  });

  it('ignores lines without a limit and returns null when none has one', () => {
    expect(tightestCredit(null, { limit: null, used: 5 }, { limit: 1_000, used: 0 })).toEqual({ limit: 1_000, used: 0 });
    expect(tightestCredit(null, { limit: null, used: 5 })).toBeNull();
    expect(tightestCredit()).toBeNull();
  });
});

describe('isDealerScope', () => {
  it('matches the dealer login scope and staff scopes for its Odoo partner only', () => {
    expect(isDealerScope('dealer:d1', 'd1', 42)).toBe(true);
    expect(isDealerScope('dealer:d2', 'd1', 42)).toBe(false);
    expect(isDealerScope('staff:u9:42', 'd1', 42)).toBe(true);
    expect(isDealerScope('staff:u9:142', 'd1', 42)).toBe(false);
    expect(isDealerScope('staff:u9:demo', 'd1', null)).toBe(false);
  });
});

describe('webCreditUsed', () => {
  const dealer = { id: 'd1', odooPartnerId: 42, creditOpening: 5_000 };
  const order = (over: Partial<{ scope: string; paymentMethod: string; status: string; total: number }>) => ({ scope: 'dealer:d1', paymentMethod: 'CREDIT', status: 'PENDING', total: 1_000, ...over });

  it('is the opening balance plus open credit orders of the dealer', () => {
    expect(webCreditUsed(dealer, [order({}), order({ status: 'INVOICED', total: 2_500.25 }), order({ scope: 'staff:u1:42', status: 'SHIPPED' })])).toBe(9_500.25);
  });

  it('gives the amount back once an order is paid or cancelled', () => {
    expect(webCreditUsed(dealer, [order({ status: 'PAID' }), order({ status: 'CANCELLED' })])).toBe(5_000);
  });

  it('skips cash orders and other dealers', () => {
    expect(webCreditUsed(dealer, [order({ paymentMethod: 'CASH' }), order({ scope: 'dealer:d2' })])).toBe(5_000);
  });

  it('uses Odoo Total Receivable instead of the manual opening and skips invoiced orders already in it', () => {
    const orders = [order({}), order({ status: 'INVOICED', total: 2_500.25 }), order({ scope: 'staff:u1:42', status: 'SHIPPED' })];
    expect(webCreditUsed(dealer, orders, 12_000.5)).toBe(14_000.5);
    expect(webCreditUsed(dealer, orders, 0)).toBe(2_000);
  });

  it('falls back to the manual opening when the receivable is unknown', () => {
    expect(webCreditUsed(dealer, [order({ status: 'INVOICED' })], null)).toBe(6_000);
  });
});

describe('webCreditLine', () => {
  it('is null without a web limit and reads NUMERIC strings', () => {
    expect(webCreditLine({ id: 'd1', odooPartnerId: null, creditLimit: null, creditOpening: '100' }, [])).toBeNull();
    expect(webCreditLine({ id: 'd1', odooPartnerId: null, creditLimit: '50000.00', creditOpening: '1200.50' }, [{ scope: 'dealer:d1', paymentMethod: 'CREDIT', status: 'PENDING', total: 800 }]))
      .toEqual({ limit: 50_000, used: 2_000.5 });
    expect(webCreditLine({ id: 'd1', odooPartnerId: 42, creditLimit: '50000.00', creditOpening: '1200.50' }, [], 3_000)).toEqual({ limit: 50_000, used: 3_000 });
  });
});

describe('parseOrderScope', () => {
  it('reads dealer and staff scopes', () => {
    expect(parseOrderScope('dealer:d1')).toEqual({ dealerId: 'd1' });
    expect(parseOrderScope('staff:u1:42')).toEqual({ odooPartnerId: 42 });
  });
  it('returns null for demo, empty or unknown scopes', () => {
    expect(parseOrderScope('staff:u1:demo')).toBeNull();
    expect(parseOrderScope('dealer:')).toBeNull();
    expect(parseOrderScope('staff:u1:0')).toBeNull();
    expect(parseOrderScope('guest')).toBeNull();
  });
});

describe('orderCreditView', () => {
  it('takes the order back out of a line that already counts it (web)', () => {
    expect(orderCreditView({ limit: 100_000, used: 60_000 }, 10_000, true)).toEqual({ limit: 100_000, used: 50_000, before: 50_000, after: 40_000, over: false });
  });
  it('subtracts the order from a line that does not count it yet (Odoo)', () => {
    expect(orderCreditView({ limit: 50_000, used: 45_000 }, 6_000.5, false)).toEqual({ limit: 50_000, used: 45_000, before: 5_000, after: -1_000.5, over: true });
  });
  it('is null without a limit', () => {
    expect(orderCreditView(null, 1_000, true)).toBeNull();
    expect(orderCreditView({ limit: null, used: 5 }, 1_000, false)).toBeNull();
  });
});

describe('overdueFromInvoices', () => {
  const today = '2026-11-06';
  it('sums invoices due before today that still owe more than 1 baht', () => {
    const result = overdueFromInvoices([
      { residual: 10_000, dueDate: '2026-10-31' },
      { residual: 2_500.5, dueDate: '2026-11-05' },
      { residual: 9_000, dueDate: today },
      { residual: 0.4, dueDate: '2026-09-01' },
      { residual: 5_000, dueDate: null },
      { residual: -3_000, dueDate: '2026-10-01', refund: true },
    ], today);
    expect(result).toEqual({ amount: 12_500.5, count: 2, oldestDueDate: '2026-10-31', source: 'odoo', graceDays: 0, grace: null });
    expect(isOverdueLocked(result)).toBe(true);
    expect(isInGrace(result)).toBe(false);
  });
  it('does not lock when nothing is past due', () => {
    const result = overdueFromInvoices([{ residual: 1_000, dueDate: '2026-12-01' }], today);
    expect(result.count).toBe(0);
    expect(result.grace).toBeNull();
    expect(isOverdueLocked(result)).toBe(false);
    expect(isOverdueLocked(null)).toBe(false);
    expect(isInGrace(null)).toBe(false);
  });
  it('keeps credit open inside the grace days and reports the lock date', () => {
    // Client example: due 5 Nov, 10 grace days, ordering on 11 Nov → still open, locks from 16 Nov.
    const result = overdueFromInvoices([{ residual: 8_000, dueDate: '2026-11-05' }, { residual: 500, dueDate: '2026-11-10' }], '2026-11-11', 10);
    expect(result).toEqual({ amount: 0, count: 0, oldestDueDate: null, source: 'odoo', graceDays: 10, grace: { amount: 8_500, count: 2, lockDate: '2026-11-16' } });
    expect(isOverdueLocked(result)).toBe(false);
    expect(isInGrace(result)).toBe(true);
  });
  it('locks on the day after the grace days run out and keeps newer past-due invoices as grace', () => {
    const open = overdueFromInvoices([{ residual: 8_000, dueDate: '2026-11-05' }], '2026-11-15', 10);
    expect(open.count).toBe(0);
    expect(open.grace?.lockDate).toBe('2026-11-16');
    const locked = overdueFromInvoices([{ residual: 8_000, dueDate: '2026-11-05' }, { residual: 300, dueDate: '2026-11-12' }], '2026-11-16', 10);
    expect(locked).toMatchObject({ amount: 8_000, count: 1, oldestDueDate: '2026-11-05', graceDays: 10, grace: { amount: 300, count: 1, lockDate: '2026-11-23' } });
    expect(isOverdueLocked(locked)).toBe(true);
    expect(isInGrace(locked)).toBe(false);
  });
});

describe('addDays / daysBetween / thaiDate', () => {
  it('does whole-day arithmetic on YYYY-MM-DD across month ends', () => {
    expect(addDays('2026-11-05', 11)).toBe('2026-11-16');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-11', '2026-11-16')).toBe(5);
    expect(daysBetween('2026-11-16', '2026-11-11')).toBe(-5);
  });
  it('formats a day in Thai with the Buddhist year', () => {
    expect(thaiDate('2026-11-16')).toMatch(/16 พ\.ย\. 2569/);
    expect(thaiDate('not-a-date')).toBe('not-a-date');
  });
});

describe('overdueFromWebOrders', () => {
  const dealer = { id: 'd1', odooPartnerId: 42 };
  const inv = (amountResidual: number, dueDate: string | null, paymentState = 'not_paid') => ({ amountResidual, dueDate, paymentState });
  const orders = [
    { scope: 'dealer:d1', paymentMethod: 'CREDIT', status: 'INVOICED', odoo: { progress: { invoices: [inv(4_000, '2026-10-20'), inv(1_000, '2026-12-01')] } } },
    { scope: 'staff:u9:42', paymentMethod: 'CREDIT', status: 'INVOICED', odoo: { progress: { invoices: [inv(2_000, '2026-11-01T00:00:00')] } } },
    { scope: 'dealer:d1', paymentMethod: 'CREDIT', status: 'INVOICED', odoo: { progress: { invoices: [inv(7_000, '2026-10-01', 'in_payment')] } } },
    { scope: 'dealer:d1', paymentMethod: 'CREDIT', status: 'PAID', odoo: { progress: { invoices: [inv(7_000, '2026-10-01')] } } },
    { scope: 'dealer:d2', paymentMethod: 'CREDIT', status: 'INVOICED', odoo: { progress: { invoices: [inv(7_000, '2026-10-01')] } } },
    { scope: 'dealer:d1', paymentMethod: 'CASH', status: 'INVOICED', odoo: { progress: { invoices: [inv(7_000, '2026-10-01')] } } },
    { scope: 'dealer:d1', paymentMethod: 'CREDIT', status: 'PREPARING', odoo: null },
  ];
  it("counts unpaid past-due invoices of the dealer's open credit orders only", () => {
    expect(overdueFromWebOrders(dealer, orders, '2026-11-06')).toEqual({ amount: 6_000, count: 2, oldestDueDate: '2026-10-20', source: 'web', graceDays: 0, grace: null });
  });
  it('applies the grace days the same way as the Odoo path', () => {
    expect(overdueFromWebOrders(dealer, orders, '2026-11-06', 10)).toEqual({ amount: 4_000, count: 1, oldestDueDate: '2026-10-20', source: 'web', graceDays: 10, grace: { amount: 2_000, count: 1, lockDate: '2026-11-12' } });
  });
});

describe('overdueLockMessage / overdueGraceMessage', () => {
  it('states count and amount and that cash still works', () => {
    expect(overdueLockMessage({ amount: 12_500.5, count: 2, oldestDueDate: '2026-10-31', source: 'odoo', graceDays: 0, grace: null })).toBe('มียอดเลยกำหนดชำระ 2 ใบ รวม 12,500.50 บาท · ชำระก่อนจึงจะสั่งแบบเครดิตได้ (สั่งเงินสดได้ตามปกติ)');
    expect(overdueLockMessage({ amount: 8_000, count: 1, oldestDueDate: '2026-11-05', source: 'odoo', graceDays: 10, grace: null })).toContain('เลยกำหนดชำระเกิน 10 วัน 1 ใบ รวม 8,000.00 บาท');
  });
  it('tells the dealer the last day to pay and the lock date', () => {
    const text = overdueGraceMessage({ amount: 0, count: 0, oldestDueDate: null, source: 'odoo', graceDays: 10, grace: { amount: 8_500, count: 2, lockDate: '2026-11-16' } });
    expect(text).toContain('2 ใบ รวม 8,500.00 บาท');
    expect(text).toContain('ชำระภายใน 15 พ.ย. 2569');
    expect(text).toContain('ปิดสั่งแบบเครดิตตั้งแต่ 16 พ.ย. 2569');
    expect(text).toContain('สั่งเงินสดได้ตามปกติ');
  });
});
