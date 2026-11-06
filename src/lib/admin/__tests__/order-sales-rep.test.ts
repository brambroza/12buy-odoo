import { describe, expect, it } from 'vitest';
import { orderPartnerId, orderSalesRepLookup } from '../order-sales-rep';

const dealers = [{ id: 'd1', odooPartnerId: 10 }, { id: 'd2', odooPartnerId: 20 }, { id: 'd3', odooPartnerId: null }];
const customers = [
  { id: 10, salesTags: ['สมชาย', 'สมหญิง'], salesperson: 'admin' },
  { id: 20, salesTags: [], salesperson: 'Sales Login' },
  { id: 30, salesTags: [], salesperson: null },
];

describe('orderPartnerId', () => {
  const byDealer = new Map([['d1', 10]]);
  it('maps a dealer scope through the dealer link', () => expect(orderPartnerId('dealer:d1', byDealer)).toBe(10));
  it('reads the partner from a staff scope', () => expect(orderPartnerId('staff:u1:30', byDealer)).toBe(30));
  it('returns null for demo, guest and unknown dealers', () => {
    expect(orderPartnerId('staff:u1:demo', byDealer)).toBeNull();
    expect(orderPartnerId('guest', byDealer)).toBeNull();
    expect(orderPartnerId('dealer:nope', byDealer)).toBeNull();
  });
});

describe('orderSalesRepLookup', () => {
  const repFor = orderSalesRepLookup(dealers, customers);
  it('uses the first Sale tag', () => expect(repFor('dealer:d1')).toEqual({ name: 'สมชาย', fromTag: true }));
  it('falls back to the Odoo salesperson', () => expect(repFor('dealer:d2')).toEqual({ name: 'Sales Login', fromTag: false }));
  it('works for staff orders on behalf of a dealer', () => expect(repFor('staff:u9:10')?.name).toBe('สมชาย'));
  it('returns null without a rep or without an Odoo link', () => {
    expect(repFor('staff:u9:30')).toBeNull();
    expect(repFor('dealer:d3')).toBeNull();
    expect(repFor('staff:u9:99')).toBeNull();
  });
});
