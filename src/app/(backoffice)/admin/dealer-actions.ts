'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { CredentialResult } from '@/components/admin/credential-forms';
import { audit } from '@/lib/auth/audit';
import { generateTempPassword } from '@/lib/auth/password';
import { findResetRequest, resolveResetRequests } from '@/lib/auth/reset-requests';
import { canManageRole, type Role } from '@/lib/auth/roles';
import { requireAdmin, requireBackoffice, revokeAllSessions } from '@/lib/auth/session';
import { createUser, createUserWithHash, findUserByEmail, findUserById, isUniqueViolation, setPassword, updateUser } from '@/lib/auth/users';
import { createDealer, getDealer, updateDealer } from '@/lib/dealers/repo';
import { clearLeadPassword, findLead, setLeadStatus } from '@/lib/leads/repo';
import { formatThaiAddress, parseThaiAddress } from '@/lib/thai-address';
import { ensureDealerPartner } from '@/lib/odoo/dealer-partner';
import * as admin from '@/lib/admin/store';
import { PROVINCES } from '@/lib/provinces';
import { DEALER_COOKIE, encodeProfile, profileFromDealer } from '@/lib/shop/dealer';
import { flash } from '@/lib/flash';

const typeSchema = z.enum(['CAR', 'TRUCK', 'MOTORCYCLE', 'BATTERY', 'WHEEL']);
const tierSchema = z.enum(['S', 'M', 'L']);
const statusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']);
const provinceSchema = z.string().trim().refine((p) => (PROVINCES as readonly string[]).includes(p), 'เลือกจังหวัด');
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null);
/** Baht amount typed by an admin ("50,000" is fine); blank = null. Two decimals, fits NUMERIC(14,2). */
const optionalBaht = z.string().trim().transform((value, ctx) => {
  const text = value.replace(/,/g, '');
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999_999) {
    ctx.addIssue({ code: 'custom', message: 'จำนวนเงินเครดิตไม่ถูกต้อง (ต้องเป็นตัวเลขไม่ติดลบ)' });
    return z.NEVER;
  }
  return Math.round(amount * 100) / 100;
});

const dealerSchema = z.object({
  name: z.string().trim().min(2, 'กรอกชื่อร้าน').max(120),
  province: provinceSchema,
  types: z.array(typeSchema).min(1, 'เลือกประเภทอย่างน้อย 1'),
  tier: tierSchema,
  status: statusSchema,
  odooPartnerId: z.union([z.literal(''), z.coerce.number().int().positive()]).transform((v) => (v === '' ? null : v)),
  address: optionalText(300),
  phone: optionalText(30),
  lineId: optionalText(60),
  taxId: optionalText(20),
  creditEnabled: z.boolean(),
  creditLimit: optionalBaht,
  creditOpening: optionalBaht.transform((v) => v ?? 0),
  notes: optionalText(500),
});

function readDealerForm(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? '');
  return dealerSchema.safeParse({
    name: s('name'), province: s('province'), types: formData.getAll('types').map(String), tier: s('tier'), status: s('status'),
    odooPartnerId: s('odooPartnerId').trim(), address: s('address'), phone: s('phone'), lineId: s('lineId'), taxId: s('taxId'), creditEnabled: formData.get('creditEnabled') === 'on', creditLimit: s('creditLimit'), creditOpening: s('creditOpening'), notes: s('notes'),
  });
}

/** Stores the dealer's customer group from the form (`customerGroupId`, blank = no group). Returns the saved id. */
async function saveDealerGroup(dealerId: string, formData: FormData): Promise<string | null> {
  const groupId = String(formData.get('customerGroupId') ?? '').trim();
  await admin.setDealerGroup(dealerId, (await admin.getGroup(groupId)) ? groupId : null);
  return (await admin.groupForDealer(dealerId))?.id ?? null;
}

function revalidate() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Creates a dealer record manually (optionally linked to an Odoo partner). */
export async function createDealerAction(formData: FormData) {
  const actor = await requireAdmin();
  const parsed = readDealerForm(formData);
  if (!parsed.success) fail('/admin/dealers', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  let id: string;
  try {
    const dealer = await createDealer(parsed.data);
    id = dealer.id;
    if (parsed.data.status === 'ACTIVE') await updateDealer(id, { approvedAt: new Date(), approvedById: actor.id });
  } catch (error) {
    if (isUniqueViolation(error)) fail('/admin/dealers', 'ลูกค้า Odoo รายนี้ถูกผูกกับดีลเลอร์อื่นแล้ว');
    throw error;
  }
  const groupId = await saveDealerGroup(id, formData);
  await audit(actor.id, 'dealer.create', 'Dealer', id, { ...parsed.data, customerGroupId: groupId });
  revalidate();
  await flash('สร้างดีลเลอร์แล้ว', { icon: 'store', description: `${parsed.data.name} · ขั้นต่อไป: สร้างบัญชีเข้าสู่ระบบให้ร้าน` });
  redirect(`/admin/dealers?open=${id}&saved=1`);
}

/** Edits type/tier/status/province/Odoo link of a dealer. Activation stamps approvedAt; suspension signs its users out. */
export async function updateDealerAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get('dealerId') ?? '');
  const before = await getDealer(id);
  if (!before) redirect('/admin/dealers');
  const parsed = readDealerForm(formData);
  if (!parsed.success) fail(`/admin/dealers`, parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  const becomingActive = parsed.data.status === 'ACTIVE' && before.status !== 'ACTIVE';
  try {
    await updateDealer(id, { ...parsed.data, ...(becomingActive ? { approvedAt: new Date(), approvedById: actor.id } : {}) });
  } catch (error) {
    if (isUniqueViolation(error)) fail('/admin/dealers', 'ลูกค้า Odoo รายนี้ถูกผูกกับดีลเลอร์อื่นแล้ว');
    throw error;
  }
  if (parsed.data.status === 'SUSPENDED') for (const u of before.users) await revokeAllSessions(u.id);
  const groupBefore = (await admin.groupForDealer(id))?.id ?? null;
  const groupAfter = await saveDealerGroup(id, formData);
  await audit(actor.id, 'dealer.update', 'Dealer', id, { from: { status: before.status, tier: before.tier, types: before.types, creditEnabled: before.creditEnabled, creditLimit: before.creditLimit === null ? null : Number(before.creditLimit), creditOpening: Number(before.creditOpening), customerGroupId: groupBefore }, to: { status: parsed.data.status, tier: parsed.data.tier, types: parsed.data.types, creditEnabled: parsed.data.creditEnabled, creditLimit: parsed.data.creditLimit, creditOpening: parsed.data.creditOpening, customerGroupId: groupAfter } });
  revalidate();
  await flash('บันทึกข้อมูลดีลเลอร์แล้ว', {
    icon: 'save',
    description: parsed.data.status === 'SUSPENDED' && before.status !== 'SUSPENDED' ? `${parsed.data.name} · ระงับร้านและออกจากระบบผู้ใช้ทุกคนแล้ว`
      : becomingActive ? `${parsed.data.name} · เปิดใช้งานร้านแล้ว` : parsed.data.name,
  });
  redirect(`/admin/dealers?open=${id}&saved=1`);
}

/** Creates a login for a dealer. Returns the temporary password once (only its hash is stored). */
export async function createDealerUserAction(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const actor = await requireAdmin();
  const parsed = z.object({ dealerId: z.string().min(1), name: z.string().trim().min(1, 'กรอกชื่อ').max(80), email: z.string().trim().email('อีเมลไม่ถูกต้อง'), role: z.enum(['DEALER_OWNER', 'DEALER_STAFF']) })
    .safeParse({ dealerId: formData.get('dealerId'), name: formData.get('name'), email: formData.get('email'), role: formData.get('role') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  if (!(await getDealer(parsed.data.dealerId))) return { ok: false, message: 'ไม่พบดีลเลอร์' };
  const tempPassword = generateTempPassword();
  try {
    const user = await createUser({ email: parsed.data.email, name: parsed.data.name, password: tempPassword, role: parsed.data.role, dealerId: parsed.data.dealerId, mustChangePassword: true });
    await audit(actor.id, 'user.create', 'User', user.id, { role: user.role, dealerId: parsed.data.dealerId });
    revalidate();
    await flash('สร้างบัญชีผู้ใช้ร้านแล้ว', { icon: 'user', description: `${user.email} · คัดลอกรหัสชั่วคราวส่งให้ร้านทาง LINE` });
    return { ok: true, message: 'สร้างผู้ใช้แล้ว', email: user.email, tempPassword };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' };
    throw error;
  }
}

/** Issues a new temporary password and signs the user out everywhere. */
export async function resetPasswordAction(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const actor = await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  const target = await findUserById(userId);
  if (!target) return { ok: false, message: 'ไม่พบผู้ใช้' };
  if (!canManageRole(actor.role as Role, target.role as Role)) return { ok: false, message: 'ไม่มีสิทธิ์รีเซ็ตผู้ใช้นี้' };
  const tempPassword = generateTempPassword();
  await setPassword(userId, tempPassword, true);
  await revokeAllSessions(userId);
  await resolveResetRequests(userId, actor.id);
  await audit(actor.id, 'user.reset-password', 'User', userId);
  revalidate();
  await flash('รีเซ็ตรหัสผ่านแล้ว', { icon: 'key', description: `${target.email} · ออกจากระบบทุกอุปกรณ์แล้ว ส่งรหัสชั่วคราวให้ผู้ใช้` });
  return { ok: true, message: 'รีเซ็ตแล้ว', email: target.email, tempPassword };
}

/** Closes a forgot-password request without issuing a new password (spam, or handled another way). */
export async function dismissResetRequestAction(formData: FormData) {
  const actor = await requireAdmin();
  const requestId = String(formData.get('requestId') ?? '');
  const request = await findResetRequest(requestId);
  if (!request || !canManageRole(actor.role as Role, request.user.role as Role)) redirect('/admin/users');
  await resolveResetRequests(request.userId, actor.id, 'DISMISSED');
  await audit(actor.id, 'password-reset.dismiss', 'PasswordResetRequest', requestId);
  revalidate();
  await flash('ปิดคำขอรีเซ็ตรหัสผ่านแล้ว', { type: 'info', icon: 'key', description: request.user.email });
  redirect('/admin/users');
}

/** Enables/disables a login. Disabling also revokes sessions. You cannot disable yourself. */
export async function toggleUserActiveAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  const back = String(formData.get('back') ?? '/admin/users');
  const target = await findUserById(userId);
  if (!target || target.id === actor.id || !canManageRole(actor.role as Role, target.role as Role)) redirect(back);
  await updateUser(userId, { isActive: !target.isActive });
  if (target.isActive) await revokeAllSessions(userId);
  await audit(actor.id, target.isActive ? 'user.deactivate' : 'user.activate', 'User', userId);
  revalidate();
  await flash(target.isActive ? 'ปิดใช้งานผู้ใช้แล้ว' : 'เปิดใช้งานผู้ใช้แล้ว', { icon: target.isActive ? 'userOff' : 'user', description: target.isActive ? `${target.email} · ออกจากระบบทุกอุปกรณ์แล้ว` : target.email });
  redirect(back);
}

/** Staff opens the shop as this dealer (8-hour impersonation cookie). */
export async function openAsDealerAction(formData: FormData) {
  const actor = await requireBackoffice();
  const dealer = await getDealer(String(formData.get('dealerId') ?? ''));
  if (!dealer) redirect('/admin/dealers');
  const profile = await profileFromDealer(dealer);
  const jar = await cookies();
  jar.set(DEALER_COOKIE, encodeProfile(profile), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 });
  await audit(actor.id, 'dealer.impersonate', 'Dealer', dealer.id);
  revalidatePath('/shop', 'layout');
  await flash(`กำลังดูร้านในมุมมองของ ${dealer.name}`, { type: 'info', icon: 'eye', description: 'ราคาและสินค้าตามที่ร้านเห็น · ใช้ได้ 8 ชั่วโมง' });
  redirect('/shop');
}

/**
 * Approve a lead: create an ACTIVE dealer from it (with the sign-up address), link them, create the
 * DEALER_OWNER login from the email + password the shop chose, and create/link its Odoo customer.
 */
export async function approveLeadAction(formData: FormData) {
  const actor = await requireAdmin();
  const leadId = String(formData.get('leadId') ?? '');
  const lead = await findLead(leadId);
  if (!lead || lead.status === 'APPROVED') redirect('/admin/leads');
  const tier = tierSchema.safeParse(formData.get('tier')).data ?? 'M';
  const shipping = parseThaiAddress(lead.address);
  const dealer = await createDealer({
    name: lead.shopName, province: lead.province, types: lead.types, tier, status: 'ACTIVE', phone: lead.phone, lineId: lead.lineId,
    ...(shipping ? { address: formatThaiAddress(shipping), shippingAddress: shipping } : {}),
  });
  await updateDealer(dealer.id, { approvedAt: new Date(), approvedById: actor.id });
  await setLeadStatus(leadId, 'APPROVED', { dealerId: dealer.id });
  await audit(actor.id, 'lead.approve', 'DealerLead', leadId, { dealerId: dealer.id, tier });
  let accountNote = '';
  if (lead.email && lead.passwordHash) {
    if (await findUserByEmail(lead.email)) {
      accountNote = `อีเมล ${lead.email} มีบัญชีอยู่แล้ว ยังไม่ได้สร้างบัญชีให้ร้าน กรุณาสร้างเองด้านล่าง`;
    } else {
      const owner = await createUserWithHash({ email: lead.email, name: lead.shopName, passwordHash: lead.passwordHash, role: 'DEALER_OWNER', dealerId: dealer.id });
      await audit(actor.id, 'user.create', 'User', owner.id, { role: 'DEALER_OWNER', dealerId: dealer.id, via: 'lead' });
    }
    await clearLeadPassword(leadId);
  }
  let odooError = '';
  try {
    const partnerId = await ensureDealerPartner(dealer, (await profileFromDealer(dealer)).pricelistId);
    await audit(actor.id, 'dealer.odoo_link', 'Dealer', dealer.id, { odooPartnerId: partnerId });
  } catch (error) {
    // Approval stands; the partner is created again on the dealer's first confirmed order.
    odooError = error instanceof Error ? error.message : String(error);
  }
  revalidate();
  const problems = [odooError && `อนุมัติแล้ว แต่ยังผูกลูกค้า Odoo ไม่ได้: ${odooError}`, accountNote].filter(Boolean).join(' · ');
  const odooParam = problems ? `&error=${encodeURIComponent(problems)}` : '';
  await flash('อนุมัติใบสมัครแล้ว', {
    type: problems ? 'warning' : 'success', icon: 'store',
    description: problems ? `${lead.shopName} · มีเรื่องต้องตามต่อ ดูรายละเอียดในหน้า` : `${lead.shopName} · สร้างร้านและบัญชีเจ้าของร้านแล้ว`,
  });
  redirect(`/admin/dealers?open=${dealer.id}&fromLead=1${odooParam}`);
}

/** Mark a lead contacted / rejected (or back to new). */
export async function setLeadStatusAction(formData: FormData) {
  const actor = await requireBackoffice();
  const parsed = z.object({ leadId: z.string().min(1), status: z.enum(['NEW', 'CONTACTED', 'REJECTED']), note: z.string().trim().max(300) })
    .safeParse({ leadId: formData.get('leadId'), status: formData.get('status'), note: formData.get('note') ?? '' });
  if (!parsed.success) redirect('/admin/leads');
  await setLeadStatus(parsed.data.leadId, parsed.data.status, { note: parsed.data.note || undefined });
  if (parsed.data.status === 'REJECTED') await clearLeadPassword(parsed.data.leadId);
  await audit(actor.id, `lead.${parsed.data.status.toLowerCase()}`, 'DealerLead', parsed.data.leadId);
  revalidate();
  const leadToast = { CONTACTED: ['บันทึกว่าติดต่อแล้ว', 'send'], REJECTED: ['ปฏิเสธใบสมัครแล้ว', 'reject'], NEW: ['ย้ายกลับเป็นใบสมัครใหม่แล้ว', 'mail'] } as const;
  const [leadTitle, leadIcon] = leadToast[parsed.data.status];
  await flash(leadTitle, { type: parsed.data.status === 'REJECTED' ? 'info' : 'success', icon: leadIcon, description: parsed.data.note || undefined });
  redirect('/admin/leads');
}

/** Staff accounts (admin / sales / warehouse). Only SUPER_ADMIN may create another SUPER_ADMIN. */
export async function createStaffUserAction(_prev: CredentialResult, formData: FormData): Promise<CredentialResult> {
  const actor = await requireAdmin();
  const parsed = z.object({ name: z.string().trim().min(1, 'กรอกชื่อ').max(80), email: z.string().trim().email('อีเมลไม่ถูกต้อง'), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE']) })
    .safeParse({ name: formData.get('name'), email: formData.get('email'), role: formData.get('role') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  if (!canManageRole(actor.role as Role, parsed.data.role)) return { ok: false, message: 'ไม่มีสิทธิ์สร้างผู้ใช้ระดับนี้' };
  const tempPassword = generateTempPassword();
  try {
    const user = await createUser({ email: parsed.data.email, name: parsed.data.name, password: tempPassword, role: parsed.data.role, mustChangePassword: true });
    await audit(actor.id, 'user.create', 'User', user.id, { role: user.role });
    revalidate();
    await flash('สร้างบัญชีพนักงานแล้ว', { icon: 'user', description: `${user.email} · คัดลอกรหัสชั่วคราวส่งให้ผู้ใช้` });
    return { ok: true, message: 'สร้างผู้ใช้แล้ว', email: user.email, tempPassword };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' };
    throw error;
  }
}
