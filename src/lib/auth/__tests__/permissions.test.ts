import { describe, expect, it } from 'vitest';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/roles';

describe('can', () => {
  it('splits order work between sales and warehouse, cancel stays with admins', () => {
    expect(can('SALES', 'order.confirm')).toBe(true);
    expect(can('WAREHOUSE', 'order.confirm')).toBe(false);
    expect(can('WAREHOUSE', 'order.ship')).toBe(true);
    expect(can('SALES', 'order.ship')).toBe(false);
    expect(can('SALES', 'order.cancel')).toBe(false);
    expect(can('ADMIN', 'order.cancel')).toBe(true);
    expect(can('WAREHOUSE', 'order.verify_slip')).toBe(true);
  });
  it('refuses dealers and unknown keys', () => {
    expect(can('DEALER_OWNER', 'order.view')).toBe(false);
    expect(can('ADMIN', 'nope' as never)).toBe(false);
  });
  it('gives super admin every permission and keeps keys unique', () => {
    for (const p of PERMISSIONS) expect(can('SUPER_ADMIN', p.key)).toBe(true);
    expect(new Set(PERMISSIONS.map((p) => p.key)).size).toBe(PERMISSIONS.length);
  });
});
