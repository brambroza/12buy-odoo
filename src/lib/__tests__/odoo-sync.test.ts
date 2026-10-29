import { describe, expect, it, vi } from 'vitest';
import type { ProtoOrder } from '@/lib/shop/types';

vi.mock('@/lib/dealers/repo', () => ({ getDealer: vi.fn() }));
vi.mock('@/lib/odoo/dealer-partner', () => ({ ensureDealerPartner: vi.fn() }));
vi.mock('@/lib/odoo/sale-order', () => ({ pushOrderToOdoo: vi.fn() }));
vi.mock('@/lib/shop/dealer', () => ({ profileFromDealer: vi.fn() }));

const { canSyncOrder, dealerIdFromSession } = await import('@/lib/shop/odoo-sync');

const order = (o: Partial<ProtoOrder>) => ({ status: 'PREPARING', sessionId: 'dealer:d1', ...o }) as ProtoOrder;

describe('odoo sync eligibility', () => {
  it('reads the dealer id only from dealer sessions', () => {
    expect(dealerIdFromSession('dealer:cmvropor90001ab8iu8195vrt')).toBe('cmvropor90001ab8iu8195vrt');
    expect(dealerIdFromSession('staff:u1:42')).toBeNull();
  });

  it('allows confirmed dealer orders that are not yet in Odoo', () => {
    expect(canSyncOrder(order({}))).toBe(true);
    expect(canSyncOrder(order({ status: 'SHIPPED', odoo: { status: 'FAILED' } as ProtoOrder['odoo'] }))).toBe(true);
  });

  it('skips pending, cancelled, staff test orders and orders already in Odoo', () => {
    expect(canSyncOrder(order({ status: 'PENDING' }))).toBe(false);
    expect(canSyncOrder(order({ status: 'CANCELLED' }))).toBe(false);
    expect(canSyncOrder(order({ sessionId: 'staff:u1:demo' }))).toBe(false);
    expect(canSyncOrder(order({ odoo: { status: 'SYNCED' } as ProtoOrder['odoo'] }))).toBe(false);
    expect(canSyncOrder(order({ odoo: { status: 'MISMATCH' } as ProtoOrder['odoo'] }))).toBe(false);
  });
});
