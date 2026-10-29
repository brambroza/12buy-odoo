import { describe, expect, it } from 'vitest';
import { creditAfterOrder } from '../credit';

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
