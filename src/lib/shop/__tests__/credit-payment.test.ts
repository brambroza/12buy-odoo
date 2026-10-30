import { describe, expect, it } from 'vitest';
import { canPayCredit, creditOutstanding, creditPendingAmount, orderSlipFiles, parseCreditAmount, pendingCreditPayments } from '@/lib/shop/credit-payment';
import type { CreditPayment, ProtoOrder } from '@/lib/shop/types';

function payment(overrides: Partial<CreditPayment> = {}): CreditPayment {
  return { id: 'p1', slipFile: 'o1-a.jpg', amount: 1000, note: '', uploadedAt: '2026-10-30T01:00:00Z', status: 'PENDING', reviewedAt: null, ...overrides };
}

function order(overrides: Partial<ProtoOrder> = {}): Pick<ProtoOrder, 'paymentMethod' | 'status' | 'total' | 'payment' | 'odoo'> {
  return { paymentMethod: 'CREDIT', status: 'INVOICED', total: 5000, payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null }, odoo: undefined, ...overrides };
}

describe('canPayCredit', () => {
  it('allows confirmed, unpaid credit orders only', () => {
    expect(canPayCredit(order({ status: 'PREPARING' }))).toBe(true);
    expect(canPayCredit(order({ status: 'SHIPPED' }))).toBe(true);
    expect(canPayCredit(order({ status: 'INVOICED' }))).toBe(true);
    expect(canPayCredit(order({ status: 'PENDING' }))).toBe(false);
    expect(canPayCredit(order({ status: 'PAID' }))).toBe(false);
    expect(canPayCredit(order({ status: 'CANCELLED' }))).toBe(false);
    expect(canPayCredit(order({ paymentMethod: 'CASH' }))).toBe(false);
  });
});

describe('creditOutstanding', () => {
  it('uses the unpaid residual of posted Odoo invoices when known', () => {
    const o = order({ odoo: { status: 'SYNCED', saleOrderId: 1, saleOrderName: 'S1', amountTotal: 5000, error: null, at: '', progress: { deliveryStatus: 'full', checkedAt: '', invoices: [
      { name: 'INV/1', paymentState: 'partial', amountResidual: 3000.004, dueDate: null },
      { name: 'INV/2', paymentState: 'paid', amountResidual: 0, dueDate: null },
    ] } } });
    expect(creditOutstanding(o)).toBe(3000);
  });

  it('falls back to the total minus verified payments, never below zero', () => {
    expect(creditOutstanding(order())).toBe(5000);
    expect(creditOutstanding(order({ payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null, credits: [payment({ status: 'VERIFIED', amount: 2000 }), payment({ id: 'p2', amount: 999 }), payment({ id: 'p3', status: 'REJECTED', amount: 999 })] } }))).toBe(3000);
    expect(creditOutstanding(order({ payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null, credits: [payment({ status: 'VERIFIED', amount: 9000 })] } }))).toBe(0);
  });

  it('sums pending (unchecked) transfers separately', () => {
    const o = order({ payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null, credits: [payment({ amount: 100.5 }), payment({ id: 'p2', amount: 200.25 }), payment({ id: 'p3', status: 'VERIFIED' })] } });
    expect(pendingCreditPayments(o)).toHaveLength(2);
    expect(creditPendingAmount(o)).toBe(300.75);
  });
});

describe('orderSlipFiles', () => {
  it('lists the cash slip and every credit payment slip', () => {
    expect(orderSlipFiles(order())).toEqual([]);
    expect(orderSlipFiles(order({ payment: { slipFile: 'o1-c.jpg', slipUploadedAt: null, verifiedAt: null, credits: [payment(), payment({ id: 'p2', slipFile: 'o1-b.png' })] } }))).toEqual(['o1-c.jpg', 'o1-a.jpg', 'o1-b.png']);
  });
});

describe('parseCreditAmount', () => {
  it('accepts baht with up to 2 decimals and thousands separators', () => {
    expect(parseCreditAmount('1,234.50')).toEqual({ ok: true, amount: 1234.5 });
    expect(parseCreditAmount(' 500 ')).toEqual({ ok: true, amount: 500 });
  });

  it('rejects empty, zero, negative, oversized and over-precise amounts', () => {
    expect(parseCreditAmount('')).toMatchObject({ ok: false });
    expect(parseCreditAmount('0')).toMatchObject({ ok: false });
    expect(parseCreditAmount('-5')).toMatchObject({ ok: false });
    expect(parseCreditAmount('abc')).toMatchObject({ ok: false });
    expect(parseCreditAmount('99999999999')).toMatchObject({ ok: false });
    expect(parseCreditAmount('1.005')).toMatchObject({ ok: false });
  });
});
