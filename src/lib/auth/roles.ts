/** Mirrors the Postgres `Role` enum so pure helpers stay testable without the client. */
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'DEALER_OWNER' | 'DEALER_STAFF';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'ผู้ดูแลระบบสูงสุด',
  ADMIN: 'แอดมิน',
  SALES: 'ฝ่ายขาย',
  WAREHOUSE: 'คลังสินค้า',
  DEALER_OWNER: 'เจ้าของร้าน',
  DEALER_STAFF: 'พนักงานร้าน',
};

const BACKOFFICE: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE'];
const DEALER: Role[] = ['DEALER_OWNER', 'DEALER_STAFF'];

/** Staff roles that may open the back office. */
export function isBackofficeRole(role: Role): boolean {
  return BACKOFFICE.includes(role);
}

/** Roles that may change dealers, users and prices. */
export function isAdminRole(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function isDealerRole(role: Role): boolean {
  return DEALER.includes(role);
}

/** Where a user lands after login when no `next` is given. */
export function homeFor(role: Role): string {
  return isBackofficeRole(role) ? '/admin/orders' : '/shop';
}

/** Whether `actor` may create or edit a user with `target` role. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === 'SUPER_ADMIN') return true;
  if (actor === 'ADMIN') return target !== 'SUPER_ADMIN';
  return false;
}
