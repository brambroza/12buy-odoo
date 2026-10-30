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
  SALES: 'ตรวจสลิป ยืนยันออเดอร์ ตรวจยอดโอนเครดิต ส่งออกรายงาน ติดตามใบสมัคร ไม่แก้การตั้งค่า',
  WAREHOUSE: 'ตรวจสลิป บันทึกเลขพัสดุ พิมพ์ใบจัดของ ไม่ยืนยัน/ยกเลิกออเดอร์ ไม่แก้การตั้งค่า',
};

/** Staff roles `actor` may give to someone (create or change role). */
export function assignableRoles(actor: Role): Role[] {
  return STAFF_ROLES.filter((r) => canManageRole(actor, r));
}

export type Permission = { key: string; group: string; label: string; roles: readonly Role[] };

const ALL_STAFF = BACKOFFICE;
const ADMINS: Role[] = ['SUPER_ADMIN', 'ADMIN'];
const SALES_SIDE: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SALES'];
const WAREHOUSE_SIDE: Role[] = ['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE'];

/**
 * What each staff role can do. Order keys are enforced by `can()` (see `permissions.ts`) inside the
 * server actions and hide the matching buttons; the rest mirror `requireAdmin` / `canManageRole`.
 */
export const PERMISSIONS = [
  { key: 'dashboard.view', group: 'งานประจำวัน', label: 'แดชบอร์ดและการแจ้งเตือนงาน', roles: ALL_STAFF },
  { key: 'order.view', group: 'ออเดอร์จากเว็บ', label: 'ดูออเดอร์ รายละเอียด และดึงสถานะจาก Odoo', roles: ALL_STAFF },
  { key: 'order.verify_slip', group: 'ออเดอร์จากเว็บ', label: 'ตรวจสลิปโอนเงิน', roles: ALL_STAFF },
  { key: 'order.confirm', group: 'ออเดอร์จากเว็บ', label: 'ยืนยันออเดอร์ (สร้าง SO ใน Odoo) และส่งเข้า Odoo อีกครั้ง', roles: SALES_SIDE },
  { key: 'order.ship', group: 'ออเดอร์จากเว็บ', label: 'บันทึกเลขพัสดุ / เลื่อนสถานะจัดส่ง / พิมพ์ใบจัดของ', roles: WAREHOUSE_SIDE },
  { key: 'order.credit_review', group: 'ออเดอร์จากเว็บ', label: 'ตรวจยอดโอนเครดิต (ผ่าน / ไม่ผ่าน)', roles: SALES_SIDE },
  { key: 'order.cancel', group: 'ออเดอร์จากเว็บ', label: 'ยกเลิกออเดอร์ (รวม SO ใน Odoo)', roles: ADMINS },
  { key: 'order.export', group: 'ออเดอร์จากเว็บ', label: 'ส่งออก CSV / Excel และรายงาน', roles: SALES_SIDE },
  { key: 'dealer.view', group: 'งานประจำวัน', label: 'ดูดีลเลอร์ / ลูกค้า Odoo และเปิดหน้าร้านแทนดีลเลอร์', roles: ALL_STAFF },
  { key: 'lead.view', group: 'งานประจำวัน', label: 'ดูใบสมัครดีลเลอร์และบันทึกว่าติดต่อแล้ว', roles: ALL_STAFF },
  { key: 'dealer.manage', group: 'ดีลเลอร์', label: 'อนุมัติใบสมัคร สร้าง/แก้ไขดีลเลอร์ วงเงิน และราคาต่อลูกค้า', roles: ADMINS },
  { key: 'dealer.users', group: 'ดีลเลอร์', label: 'สร้างบัญชีผู้ใช้ร้านและรีเซ็ตรหัสผ่านร้าน', roles: ADMINS },
  { key: 'settings.pricing', group: 'ตั้งค่า', label: 'กลุ่มลูกค้า โซนราคา และตารางราคา', roles: ADMINS },
  { key: 'settings.commerce', group: 'ตั้งค่า', label: 'คูปอง การจัดส่ง และโปรโมชันหน้าแรก', roles: ADMINS },
  { key: 'settings.system', group: 'ตั้งค่า', label: 'การเชื่อมต่อ Odoo และ LINE', roles: ADMINS },
  { key: 'audit.view', group: 'ตั้งค่า', label: 'ดูประวัติการแก้ไข (audit log)', roles: ADMINS },
  { key: 'users.manage', group: 'ผู้ใช้และสิทธิ์', label: 'เพิ่ม/แก้ไขผู้ใช้ทีมงาน เปลี่ยนบทบาท เปิด-ปิดใช้งาน รีเซ็ตรหัสผ่าน', roles: ADMINS },
  { key: 'users.super', group: 'ผู้ใช้และสิทธิ์', label: 'จัดการบัญชีผู้ดูแลระบบสูงสุด', roles: ['SUPER_ADMIN'] as readonly Role[] },
  { key: 'profile.self', group: 'บัญชีของตัวเอง', label: 'แก้ชื่อ เบอร์โทร รูปโปรไฟล์ และเปลี่ยนรหัสผ่าน', roles: ALL_STAFF },
] as const satisfies readonly Permission[];
