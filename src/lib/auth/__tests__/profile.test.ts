import { describe, expect, it } from 'vitest';
import { parseProfileForm } from '@/lib/auth/profile';
import { PERMISSIONS, STAFF_ROLES, assignableRoles } from '@/lib/auth/roles';

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe('parseProfileForm', () => {
  it('trims the name and normalises the phone', () => {
    const r = parseProfileForm(form({ name: '  สมชาย ใจดี ', phone: '081-234-5678' }));
    expect(r.success && r.data).toEqual({ name: 'สมชาย ใจดี', phone: '0812345678' });
  });

  it('treats a blank phone as null', () => {
    const r = parseProfileForm(form({ name: 'Ann', phone: '  ' }));
    expect(r.success && r.data.phone).toBeNull();
  });

  it('rejects an empty name, a too-long name and a bad phone', () => {
    expect(parseProfileForm(form({ name: ' ', phone: '' })).success).toBe(false);
    expect(parseProfileForm(form({ name: 'x'.repeat(81), phone: '' })).success).toBe(false);
    const bad = parseProfileForm(form({ name: 'Ann', phone: '12345' }));
    expect(bad.success).toBe(false);
    expect(!bad.success && bad.error.issues[0].message).toBe('เบอร์โทรไม่ถูกต้อง');
  });

  it('handles missing fields', () => {
    expect(parseProfileForm(new FormData()).success).toBe(false);
  });
});

describe('role permissions', () => {
  it('lets admins assign every staff role except super admin', () => {
    expect(assignableRoles('SUPER_ADMIN')).toEqual([...STAFF_ROLES]);
    expect(assignableRoles('ADMIN')).toEqual(['ADMIN', 'SALES', 'WAREHOUSE']);
    expect(assignableRoles('SALES')).toEqual([]);
    expect(assignableRoles('DEALER_OWNER')).toEqual([]);
  });

  it('gives every staff role its own-profile permission and keeps settings admin-only', () => {
    for (const role of STAFF_ROLES) expect(PERMISSIONS.some((p) => p.group === 'บัญชีของตัวเอง' && p.roles.includes(role))).toBe(true);
    for (const p of PERMISSIONS.filter((x) => x.group === 'ตั้งค่า')) expect(p.roles).not.toContain('SALES');
    expect(PERMISSIONS.every((p) => p.roles.every((r) => STAFF_ROLES.includes(r)))).toBe(true);
  });
});
