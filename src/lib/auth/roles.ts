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
  return isBackofficeRole(role) ? '/admin' : '/shop';
}

/** Whether `actor` may create or edit a user with `target` role. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === 'SUPER_ADMIN') return true;
  if (actor === 'ADMIN') return target !== 'SUPER_ADMIN';
  return false;
}

/** Back-office roles, most privileged first. */
export const STAFF_ROLES: readonly Role[] = BACKOFFICE;

/** Short description of each staff role, shown on the permissions page and in the role picker. */
export const ROLE_DESCRIPTIONS: Partial<Record<Role, string>> = {
  SUPER_ADMIN: 'ทำได้ทุกอย่าง รวมถึงจัดการผู้ดูแลระบบสูงสุดคนอื่น',
  ADMIN: 'ตั้งค่าราคา ดีลเลอร์ คูปอง การจัดส่ง และผู้ใช้ทีมงาน (ยกเว้นผู้ดูแลระบบสูงสุด)',
  SALES: 'ดูแลออเดอร์ ใบสมัคร และติดตามดีลเลอร์ ไม่แก้การตั้งค่า',
  WAREHOUSE: 'ดูแลออเดอร์ ตรวจสลิป จัดส่ง ไม่แก้การตั้งค่า',
};

/** Staff roles `actor` may give to someone (create or change role). */
export function assignableRoles(actor: Role): Role[] {
  return STAFF_ROLES.filter((r) => canManageRole(actor, r));
}

export type Permission = { group: string; label: string; roles: readonly Role[] };

const ALL_STAFF = BACKOFFICE;
const ADMINS: Role[] = ['SUPER_ADMIN', 'ADMIN'];

/**
 * What each staff role can do, mirroring the guards in the back office (`requireBackoffice` vs
 * `requireAdmin` and `canManageRole`). Read-only reference: changing a role here does not change access.
 */
export const PERMISSIONS: readonly Permission[] = [
  { group: 'งานประจำวัน', label: 'แดชบอร์ดและการแจ้งเตือนงาน', roles: ALL_STAFF },
  { group: 'งานประจำวัน', label: 'ออเดอร์จากเว็บ: ตรวจสลิป ยืนยัน ส่ง Odoo ยกเลิก', roles: ALL_STAFF },
  { group: 'งานประจำวัน', label: 'ดูดีลเลอร์ / ลูกค้า Odoo และเปิดหน้าร้านแทนดีลเลอร์', roles: ALL_STAFF },
  { group: 'งานประจำวัน', label: 'ดูใบสมัครดีลเลอร์และบันทึกว่าติดต่อแล้ว', roles: ALL_STAFF },
  { group: 'ดีลเลอร์', label: 'อนุมัติใบสมัคร สร้าง/แก้ไขดีลเลอร์ วงเงิน และราคาต่อลูกค้า', roles: ADMINS },
  { group: 'ดีลเลอร์', label: 'สร้างบัญชีผู้ใช้ร้านและรีเซ็ตรหัสผ่านร้าน', roles: ADMINS },
  { group: 'ตั้งค่า', label: 'กลุ่มลูกค้า โซนราคา และตารางราคา', roles: ADMINS },
  { group: 'ตั้งค่า', label: 'คูปองและการจัดส่ง', roles: ADMINS },
  { group: 'ผู้ใช้และสิทธิ์', label: 'เพิ่ม/แก้ไขผู้ใช้ทีมงาน เปลี่ยนบทบาท เปิด-ปิดใช้งาน รีเซ็ตรหัสผ่าน', roles: ADMINS },
  { group: 'ผู้ใช้และสิทธิ์', label: 'จัดการบัญชีผู้ดูแลระบบสูงสุด', roles: ['SUPER_ADMIN'] },
  { group: 'บัญชีของตัวเอง', label: 'แก้ชื่อ เบอร์โทร รูปโปรไฟล์ และเปลี่ยนรหัสผ่าน', roles: ALL_STAFF },
];
