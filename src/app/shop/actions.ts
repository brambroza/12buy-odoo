'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { baht, defaultQty, findProduct, getCatalog, getDealerCarrier, searchProducts } from '@/lib/shop/catalog';
import { flash } from '@/lib/flash';
import { billTotals, cashDiscountPerUnit, cashPercentOf, orderPricelistId, resolvePrice, withCoupon } from '@/lib/shop/pricing';
import { checkCartCoupon } from '@/lib/shop/cart-coupon';
import { normalizeCode } from '@/lib/shop/coupon';
import { creditAfterOrder } from '@/lib/shop/credit';
import { getCreditLine } from '@/lib/shop/credit-line';
import { canSeeProduct, getDealerProfile, visibilityScope } from '@/lib/shop/dealer';
import { ensureSessionId } from '@/lib/shop/session';
import * as store from '@/lib/shop/store';
import { normalizeSizeQuery } from '@/lib/shop/size';
import { parseQuickQty, pickUnit } from '@/lib/shop/units';
import { requireDealerAccess } from '@/lib/auth/session';
import { createUser, isUniqueViolation } from '@/lib/auth/users';
import { generateTempPassword } from '@/lib/auth/password';
import { audit } from '@/lib/auth/audit';
import { deleteAvatar, deleteSlip, saveAvatar, saveSlip } from '@/lib/shop/uploads';
import { addressFromForm, shippingSchema, thaiAddressSchema } from '@/lib/shop/shipping';
import { formatThaiAddress } from '@/lib/thai-address';
import { updateDealer } from '@/lib/dealers/repo';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import { ORDER_STATUS_LABELS, type OrderCoupon, type OrderLine } from '@/lib/shop/types';

const qtySchema = z.coerce.number().int().min(1).max(999);
const idSchema = z.coerce.number().int().positive();

export type ActionResult = { ok: boolean; message: string };

/** Adds one product to the cart in the chosen unit (`qty` is in that unit; stored in base units). */
export async function addToCartAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ productId: idSchema, qty: qtySchema, unitId: z.coerce.number().int().optional() })
    .safeParse({ productId: formData.get('productId'), qty: formData.get('qty'), unitId: formData.get('unitId') || undefined });
  if (!parsed.success) return { ok: false, message: 'จำนวนไม่ถูกต้อง' };
  const [catalog, profile] = await Promise.all([getCatalog(), getDealerProfile()]);
  const product = findProduct(catalog, parsed.data.productId);
  if (!product || !canSeeProduct(profile, product)) return { ok: false, message: 'ไม่พบสินค้า' };
  if (product.qtyAvailable <= 0) return { ok: false, message: 'สินค้าหมด สอบถามฝ่ายขายเรื่องของเข้า' };
  const unit = pickUnit(product.units, parsed.data.unitId);
  const baseQty = parsed.data.qty * unit.factor;
  const sid = await ensureSessionId();
  await store.addToCart(sid, product.id, baseQty, unit, parsed.data.qty);
  revalidatePath('/shop', 'layout');
  const message = unit.factor > 1 ? `ใส่ตะกร้าแล้ว ${parsed.data.qty} ${unit.name} (${baseQty} ${product.baseUnit})` : `ใส่ตะกร้าแล้ว ${baseQty} ${product.baseUnit}`;
  await flash(message, { icon: 'cart', description: product.name });
  return { ok: true, message };
}

/** Sets the quantity of a cart line (0 removes it). `qty` is in the line's unit (pack or base). */
export async function updateCartQtyAction(formData: FormData) {
  const parsed = z.object({ productId: idSchema, qty: z.coerce.number().int().min(0).max(999), unitId: z.coerce.number().int().optional() })
    .safeParse({ productId: formData.get('productId'), qty: formData.get('qty'), unitId: formData.get('unitId') || undefined });
  if (!parsed.success) return;
  const sid = await ensureSessionId();
  const unitId = parsed.data.unitId ?? null;
  const catalog = await getCatalog();
  const product = findProduct(catalog, parsed.data.productId);
  const factor = product ? pickUnit(product.units, unitId).factor : 1;
  const items = (await store.getCart(sid)).map((item) =>
    item.productId === parsed.data.productId && (item.unitId ?? null) === unitId
      ? { ...item, qty: parsed.data.qty * factor, unitQty: unitId ? parsed.data.qty : item.unitQty }
      : item,
  );
  await store.setCart(sid, items);
  revalidatePath('/shop', 'layout');
}

/** Switches a cart line to another sale unit of the same product (see `store.changeCartUnit`). */
export async function changeCartUnitAction(formData: FormData) {
  const parsed = z.object({ productId: idSchema, fromUnitId: z.coerce.number().int().optional(), toUnitId: idSchema })
    .safeParse({ productId: formData.get('productId'), fromUnitId: formData.get('fromUnitId') || undefined, toUnitId: formData.get('toUnitId') });
  if (!parsed.success) return;
  const catalog = await getCatalog();
  const product = findProduct(catalog, parsed.data.productId);
  const to = product?.units.find((u) => u.id === parsed.data.toUnitId);
  if (!product || !to) return;
  const sid = await ensureSessionId();
  await store.changeCartUnit(sid, product.id, parsed.data.fromUnitId ?? null, to);
  revalidatePath('/shop', 'layout');
  await flash(`เปลี่ยนหน่วยเป็น ${to.name} แล้ว`, { icon: 'cart', description: product.name });
}

/** Undo for a removed cart line: puts it back with the same unit and quantity. */
export async function restoreCartLineAction(formData: FormData) {
  const parsed = z.object({ productId: idSchema, qty: z.coerce.number().int().min(1).max(99_999), unitId: z.coerce.number().int().optional(), unitQty: z.coerce.number().int().min(1).max(999).optional(), index: z.coerce.number().int().min(0).max(999) })
    .safeParse({ productId: formData.get('productId'), qty: formData.get('qty'), unitId: formData.get('unitId') || undefined, unitQty: formData.get('unitQty') || undefined, index: formData.get('index') });
  if (!parsed.success) return;
  const [catalog, profile] = await Promise.all([getCatalog(), getDealerProfile()]);
  const product = findProduct(catalog, parsed.data.productId);
  if (!product || !canSeeProduct(profile, product)) return;
  const unit = parsed.data.unitId ? product.units.find((u) => u.id === parsed.data.unitId && u.factor > 1) : undefined;
  const sid = await ensureSessionId();
  await store.restoreCartLine(sid, unit && parsed.data.unitQty
    ? { productId: product.id, qty: parsed.data.unitQty * unit.factor, unitId: unit.id, unitQty: parsed.data.unitQty, unitName: unit.name }
    : { productId: product.id, qty: parsed.data.qty }, parsed.data.index);
  revalidatePath('/shop', 'layout');
  await flash('นำสินค้ากลับเข้าตะกร้าแล้ว', { icon: 'cart', description: product.name });
}

/** Stores the coupon code typed in the cart; the discount is checked against Odoo when the cart renders and again at checkout. */
export async function applyCouponAction(formData: FormData) {
  const code = normalizeCode(String(formData.get('code') ?? ''));
  if (!code) redirect('/shop/cart?error=' + encodeURIComponent('กรอกโค้ดส่วนลด'));
  const sid = await ensureSessionId();
  await store.setCartCoupon(sid, code);
  revalidatePath('/shop/cart');
  await flash(`เพิ่มโค้ด ${code} แล้ว`, { icon: 'coupon', description: 'ส่วนลดคำนวณในตะกร้า และตรวจสิทธิ์อีกครั้งตอนสั่งซื้อ' });
  redirect('/shop/cart');
}

export async function removeCouponAction() {
  const sid = await ensureSessionId();
  await store.setCartCoupon(sid, null);
  revalidatePath('/shop/cart');
  await flash('ลบโค้ดส่วนลดแล้ว', { icon: 'coupon' });
}

export async function clearCartAction() {
  const sid = await ensureSessionId();
  await store.setCart(sid, []);
  revalidatePath('/shop', 'layout');
  await flash('ล้างตะกร้าแล้ว', { icon: 'cartRemove' });
}

/**
 * Creates a web order from the cart (Odoo gets it when the admin confirms; only the coupon is read from Odoo here).
 * Credit dealers choose CREDIT or CASH; CASH earns the credit→cash difference as an end-of-bill discount.
 * A coupon in the cart is re-checked and taken off the total.
 * Everyone else always pays CASH with no discount. CASH orders must carry the transfer slip (`slip` field);
 * the admin verifies it, then confirms, which pushes the order to Odoo.
 */
/** Dealers with a checkout in flight. A second submit while the first is running is refused (double tap). */
const checkoutsInFlight = new Set<string>();

export async function checkoutAction(formData: FormData) {
  const parsed = z.object({
    address: thaiAddressSchema,
    note: z.string().trim().max(500).optional().default(''),
    paymentMethod: z.enum(['CASH', 'CREDIT']).optional(),
    poRef: z.string().trim().max(40, 'เลขที่ใบสั่งซื้อยาวเกิน 40 ตัวอักษร').optional().default(''),
  }).safeParse({ address: addressFromForm(formData), note: formData.get('note'), paymentMethod: formData.get('paymentMethod') || undefined, poRef: formData.get('poRef') ?? undefined });
  if (!parsed.success) redirect('/shop/cart?error=' + encodeURIComponent(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ'));

  const shipTo = formatThaiAddress(parsed.data.address);
  if (formData.get('saveAddress') === 'on') {
    const user = await requireDealerAccess();
    if (user.dealer && !isBackofficeRole(user.role as Role) && user.dealer.address !== shipTo) {
      await updateDealer(user.dealer.id, { address: shipTo, shippingAddress: parsed.data.address });
      await audit(user.id, 'dealer.shipping.update', 'Dealer', user.dealer.id, { address: parsed.data.address, via: 'checkout' });
    }
  }

  const sid = await ensureSessionId();
  if (checkoutsInFlight.has(sid)) redirect('/shop/orders?error=' + encodeURIComponent('กำลังส่งออเดอร์ก่อนหน้า กรุณารอสักครู่'));
  checkoutsInFlight.add(sid);
  try {
    const slip = formData.get('slip');
    await placeOrder(sid, parsed.data, shipTo, slip instanceof File && slip.size > 0 ? slip : null);
  } finally {
    checkoutsInFlight.delete(sid);
  }
}

type CheckoutInput = { note: string; paymentMethod?: 'CASH' | 'CREDIT'; poRef: string };

/**
 * Validates the cart against the live catalog, stock and credit, then creates the web order and redirects to it.
 * A cash order is refused without `slip`; the slip is stored before the order is created and attached right after.
 */
async function placeOrder(sid: string, input: CheckoutInput, shipTo: string, slip: File | null) {
  const [catalog, profile] = await Promise.all([getCatalog(), getDealerProfile()]);
  const cart = await store.getCart(sid);
  if (!cart.length) redirect('/shop/orders?error=' + encodeURIComponent('ตะกร้าว่าง หากเพิ่งกดสั่ง ออเดอร์อาจถูกสร้างแล้ว ตรวจสอบในรายการนี้'));
  // Stock is checked per product, summing lines of the same product ordered by piece and by pack.
  const qtyByProduct = new Map<number, number>();
  for (const item of cart) qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.qty);

  const lines: OrderLine[] = [];
  const priced: Parameters<typeof checkCartCoupon>[3] = [];
  for (const item of cart) {
    const product = findProduct(catalog, item.productId);
    if (!product) redirect('/shop/cart?error=' + encodeURIComponent('มีสินค้าในตะกร้าที่ไม่มีขายแล้ว ลบออกก่อนสั่ง'));
    if (!canSeeProduct(profile, product)) redirect('/shop/cart?error=' + encodeURIComponent(`${product.size?.label ?? product.name} ไม่อยู่ในรายการสินค้าของร้านแล้ว ลบออกก่อนสั่ง`));
    if ((qtyByProduct.get(product.id) ?? item.qty) > product.qtyAvailable) redirect('/shop/cart?error=' + encodeURIComponent(`${product.size?.label ?? product.name} มีในสต็อก ${product.qtyAvailable} ${product.baseUnit} ปรับจำนวนก่อนสั่ง`));
    const unitPrice = resolvePrice(catalog, product, profile, item.qty);
    const cashOff = cashDiscountPerUnit(catalog, product, profile, item.qty, unitPrice);
    const cashPercent = cashOff > 0 ? cashPercentOf(profile, product) : null;
    lines.push({ productId: product.id, name: product.name, code: product.code, size: product.size?.label ?? null, qty: item.qty, unitPrice, cashDiscountPerUnit: cashOff, ...(cashPercent !== null ? { cashDiscountPercent: cashPercent } : {}), unitId: item.unitId ?? null, unitName: item.unitName ?? null, unitQty: item.unitQty ?? null, vatRate: product.vatRate, vatIncluded: product.vatIncluded, taxIds: product.taxIds ?? [] });
    priced.push({ product, qty: item.qty, unitPrice, cashDiscountPerUnit: cashOff });
  }
  const paymentMethod = profile.credit ? input.paymentMethod ?? 'CREDIT' : 'CASH';
  // The admin sets the delivery method per customer; the dealer does not choose.
  const carrier = (await getDealerCarrier(profile.odooPartnerId))?.carrier;
  if (!carrier) redirect('/shop/cart?error=' + encodeURIComponent('ยังไม่ได้กำหนดการจัดส่งให้ร้าน ติดต่อฝ่ายขาย'));
  // The coupon is re-checked against Odoo here: the cart preview may be stale.
  const code = await store.getCartCoupon(sid);
  let coupon: OrderCoupon | null = null;
  if (code) {
    const result = (await checkCartCoupon(code, catalog, profile, priced, [paymentMethod]))[paymentMethod];
    if (!result?.ok) redirect('/shop/cart?error=' + encodeURIComponent(`โค้ด ${code}: ${result?.reason ?? 'ใช้ไม่ได้'} · ลบโค้ดหรือแก้ตะกร้าก่อนสั่ง`));
    coupon = { code, programId: result.programId, programName: result.programName, label: result.label, discount: result.discount };
  }
  const totals = withCoupon(billTotals(lines, paymentMethod), coupon?.discount ?? 0);
  if (paymentMethod === 'CREDIT') {
    // Web limit and Odoo credit_limit both apply. Odoo unreachable: only the web limit; sales still confirms the order.
    const credit = await getCreditLine(profile);
    if (creditAfterOrder(credit, totals.total).over) redirect('/shop/cart?error=' + encodeURIComponent('ยอดนี้เกินวงเงินเครดิต เลือกชำระเงินสด หรือลดจำนวน'));
  }
  let slipName: string | null = null;
  if (paymentMethod === 'CASH') {
    if (!slip) redirect('/shop/cart?error=' + encodeURIComponent('ชำระเงินสด: โอนเงินแล้วแนบสลิปก่อนยืนยันสั่งซื้อ'));
    const saved = await saveSlip(sid, slip);
    if (!saved.ok) redirect('/shop/cart?error=' + encodeURIComponent(`สลิป: ${saved.reason}`));
    slipName = saved.name;
  }
  let order;
  try {
    order = await store.createOrder({
      sessionId: sid,
      dealerName: profile.name,
      lines,
      paymentMethod,
      ...totals,
      coupon,
      odooPricelistId: orderPricelistId(profile),
      address: shipTo,
      carrier: carrier.name,
      carrierId: carrier.id,
      note: input.note,
      poRef: input.poRef || undefined,
    });
  } catch (error) {
    if (slipName) await deleteSlip(slipName);
    // The cart was emptied by a concurrent submit of the same checkout: that order already exists.
    if (error instanceof store.CartEmptyError) redirect('/shop/orders?error=' + encodeURIComponent('ออเดอร์นี้ถูกส่งไปแล้ว ตรวจสอบในรายการด้านล่าง'));
    throw error;
  }
  // Attach failing (unlikely right after create) leaves the order without a slip: the dealer re-attaches it on the order page.
  const withSlip = slipName ? await store.attachSlip(sid, order.id, slipName) : null;
  if (slipName && withSlip?.payment.slipFile !== slipName) await deleteSlip(slipName);
  revalidatePath('/shop', 'layout');
  revalidatePath('/admin/orders');
  const slipNote = !slipName ? '' : withSlip?.payment.slipFile === slipName ? ' · แนบสลิปแล้ว รอฝ่ายขายตรวจ' : ' · แนบสลิปไม่สำเร็จ กรุณาแนบใหม่ในหน้านี้';
  await flash('ส่งคำสั่งซื้อสำเร็จ', { icon: 'order', description: `${order.ref} · ยอด ${baht(order.total)}${slipNote}` });
  redirect(`/shop/orders/${order.id}?placed=1`);
}

/** Re-adds every line of a previous order to the cart, skipping products the dealer may no longer order. */
export async function reorderAction(formData: FormData) {
  const id = String(formData.get('orderId') ?? '');
  const sid = await ensureSessionId();
  const order = await store.getOrder(sid, id);
  if (!order) redirect('/shop/orders');
  const [catalog, profile] = await Promise.all([getCatalog(), getDealerProfile()]);
  let added = 0;
  for (const line of order.lines) {
    const product = findProduct(catalog, line.productId);
    if (!product || !canSeeProduct(profile, product)) continue;
    added += 1;
    const unit = line.unitId && line.unitQty ? { id: line.unitId, name: line.unitName ?? '', factor: Math.max(1, Math.round(line.qty / line.unitQty)) } : null;
    await store.addToCart(sid, line.productId, line.qty, unit, line.unitQty ?? null);
  }
  revalidatePath('/shop', 'layout');
  const skipped = order.lines.length - added;
  await flash(added ? `เพิ่ม ${added} รายการจาก ${order.ref} ลงตะกร้าแล้ว` : 'ไม่มีสินค้าที่สั่งซ้ำได้', {
    type: added ? (skipped ? 'warning' : 'success') : 'warning', icon: 'cart',
    description: skipped ? `ข้าม ${skipped} รายการที่ไม่มีขายหรือร้านสั่งไม่ได้แล้ว` : 'ตรวจจำนวนก่อนยืนยันสั่งซื้อ',
  });
  redirect('/shop/cart');
}

/** Demo only: moves the order to the next status. Back-office users only, and only with SHOP_DEMO_CONTROLS=true. */
export async function advanceOrderAction(formData: FormData) {
  const id = String(formData.get('orderId') ?? '');
  const user = await requireDealerAccess();
  if (!shopDemoControlsEnabled() || !isBackofficeRole(user.role as Role)) redirect(`/shop/orders/${id}`);
  const sid = await ensureSessionId();
  const order = await store.advanceOrder(sid, id);
  revalidatePath(`/shop/orders/${id}`);
  if (order) await flash(`เปลี่ยนสถานะเป็น “${ORDER_STATUS_LABELS[order.status]}” แล้ว`, { icon: 'truck', description: `${order.ref} · ปุ่มเดโม` });
}

export async function cancelOrderAction(formData: FormData) {
  const id = String(formData.get('orderId') ?? '');
  const sid = await ensureSessionId();
  const order = await store.cancelOrder(sid, id);
  revalidatePath(`/shop/orders/${id}`);
  if (order?.status === 'CANCELLED') await flash('ยกเลิกคำสั่งซื้อแล้ว', { icon: 'cancel', description: order.ref });
  else if (order) await flash('ยกเลิกไม่ได้', { type: 'error', icon: 'cancel', description: `${order.ref} อยู่ในสถานะ “${ORDER_STATUS_LABELS[order.status]}” แล้ว ติดต่อฝ่ายขาย` });
}

/** True when the demo status buttons may be shown/used in the shop (never on production). */
function shopDemoControlsEnabled(): boolean {
  return process.env.SHOP_DEMO_CONTROLS === 'true';
}

export type QuickOrderResult = {
  added: { line: string; name: string; qty: number; unit?: string }[];
  unresolved: { line: string; reason: string }[];
};

/**
 * Parses multi-line "size qty" input, resolves each size against the dealer's
 * allowed in-stock products (cheapest that covers the quantity wins) and adds them to the cart.
 */
export async function quickOrderAction(_prev: QuickOrderResult | null, formData: FormData): Promise<QuickOrderResult> {
  const text = String(formData.get('lines') ?? '');
  const [catalog, profile] = await Promise.all([getCatalog(), getDealerProfile()]);
  const sid = await ensureSessionId();
  const result: QuickOrderResult = { added: [], unresolved: [] };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // "<size> <qty>" where qty may be "4", "x4", "2มัด" or "2มัด5"
    const match = line.match(/^(.*?)(?:\s+([xX*]?\s*\d{1,3}\s*(?:มัด|แพ็ก|แพ็ค|pack)?\s*\d{0,3}))?$/i);
    const sizeText = match?.[1]?.trim() ?? line;
    const qtySpec = match?.[2] ? parseQuickQty(match[2].replace(/^[xX*]\s*/, '')) : null;
    if (!normalizeSizeQuery(sizeText)) { result.unresolved.push({ line, reason: 'อ่านขนาดไม่ออก' }); continue; }
    const candidates = searchProducts(catalog, { ...visibilityScope(profile), query: sizeText })
      .filter((p) => p.size)
      .sort((a, b) => resolvePrice(catalog, a, profile) - resolvePrice(catalog, b, profile));
    if (!candidates.length) { result.unresolved.push({ line, reason: 'ไม่มีสินค้าขนาดนี้' }); continue; }
    // Out-of-stock products cannot be ordered; prefer the cheapest one that covers the requested quantity.
    const inStock = candidates.filter((p) => p.qtyAvailable > 0);
    const wanted = qtySpec?.qty ?? 1;
    const product = inStock.find((p) => p.qtyAvailable >= wanted) ?? inStock[0];
    if (!product) { result.unresolved.push({ line, reason: 'ขนาดนี้หมดทุกยี่ห้อ สอบถามฝ่ายขาย' }); continue; }
    let unit = product.units[0];
    let unitQty = qtySpec?.qty ?? defaultQty(product.dealerType);
    if (qtySpec?.pack) {
      const packs = product.units.filter((u) => u.factor > 1);
      const chosen = qtySpec.pack === 'any' ? packs[0] : packs.find((u) => u.factor === qtySpec.pack);
      if (!chosen) { result.unresolved.push({ line, reason: packs.length ? `สินค้านี้มีเฉพาะ ${packs.map((u) => u.name).join(', ')}` : 'สินค้านี้ไม่มีหน่วยมัด' }); continue; }
      unit = chosen;
    }
    const baseQty = unitQty * unit.factor;
    await store.addToCart(sid, product.id, baseQty, unit, unitQty);
    result.added.push({ line, name: product.name, qty: baseQty, unit: unit.factor > 1 ? `${unitQty} ${unit.name}` : undefined });
  }
  revalidatePath('/shop', 'layout');
  if (result.added.length) {
    await flash(`เพิ่ม ${result.added.length} รายการลงตะกร้าแล้ว`, { type: result.unresolved.length ? 'warning' : 'success', icon: 'cart', description: result.unresolved.length ? `อีก ${result.unresolved.length} บรรทัดหาสินค้าไม่เจอ ดูรายละเอียดด้านล่าง` : undefined });
  } else if (result.unresolved.length) {
    await flash('ยังไม่ได้เพิ่มสินค้า', { type: 'warning', icon: 'cart', description: 'หาสินค้าไม่เจอทุกบรรทัด ดูเหตุผลด้านล่าง' });
  }
  return result;
}

/** Dealer attaches a bank-transfer slip to a pending order. */
export async function uploadSlipAction(formData: FormData) {
  const id = String(formData.get('orderId') ?? '');
  const file = formData.get('slip');
  const sid = await ensureSessionId();
  const order = await store.getOrder(sid, id);
  if (!order) redirect('/shop/orders');
  if (!(file instanceof File)) redirect(`/shop/orders/${id}?error=${encodeURIComponent('เลือกไฟล์สลิปก่อน')}`);
  const saved = await saveSlip(id, file);
  if (!saved.ok) redirect(`/shop/orders/${id}?error=${encodeURIComponent(saved.reason)}`);
  const updated = await store.attachSlip(sid, id, saved.name);
  if (updated?.payment.slipFile !== saved.name) {
    // Order moved on (confirmed/cancelled) meanwhile: drop the unused upload.
    await deleteSlip(saved.name);
    redirect(`/shop/orders/${id}?error=${encodeURIComponent('ออเดอร์นี้แนบสลิปไม่ได้แล้ว')}`);
  }
  if (order.payment.slipFile) await deleteSlip(order.payment.slipFile);
  revalidatePath(`/shop/orders/${id}`);
  revalidatePath('/admin/orders');
  await flash('แนบสลิปเรียบร้อย', { icon: 'upload', description: `${order.ref} · รอแอดมินตรวจสอบการโอน` });
  redirect(`/shop/orders/${id}?slip=1`);
}

export type StaffResult = { ok: true; message: string; email: string; tempPassword: string } | { ok: false; message: string } | null;

/** Dealer owner adds a staff login for their own shop. Temporary password is shown once. */
export async function addDealerStaffAction(_prev: StaffResult, formData: FormData): Promise<StaffResult> {
  const user = await requireDealerAccess();
  if (user.role !== 'DEALER_OWNER' || !user.dealer) return { ok: false, message: 'เฉพาะเจ้าของร้านเท่านั้น' };
  const parsed = z.object({ name: z.string().trim().min(1, 'กรอกชื่อ').max(80), email: z.string().trim().email('อีเมลไม่ถูกต้อง') }).safeParse({ name: formData.get('name'), email: formData.get('email') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  const tempPassword = generateTempPassword();
  try {
    const created = await createUser({ email: parsed.data.email, name: parsed.data.name, password: tempPassword, role: 'DEALER_STAFF', dealerId: user.dealer.id, mustChangePassword: true });
    await audit(user.id, 'user.create', 'User', created.id, { role: 'DEALER_STAFF', dealerId: user.dealer.id, by: 'owner' });
    revalidatePath('/shop/account');
    await flash('สร้างบัญชีพนักงานแล้ว', { icon: 'user', description: `${created.email} · ส่งรหัสชั่วคราวให้พนักงาน` });
    return { ok: true, message: 'สร้างแล้ว', email: created.email, tempPassword };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' };
    throw error;
  }
}

export type ShippingResult = { ok: boolean; message: string } | null;

/** Dealer (owner or staff) updates their shop's default delivery address and contact phone. */
export async function updateShippingAction(_prev: ShippingResult, formData: FormData): Promise<ShippingResult> {
  const user = await requireDealerAccess();
  if (!user.dealer || isBackofficeRole(user.role as Role)) return { ok: false, message: 'แก้ไขได้เฉพาะบัญชีร้านดีลเลอร์' };
  const parsed = shippingSchema.safeParse({ address: addressFromForm(formData), phone: formData.get('phone') ?? '' });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' };
  const { address, phone } = parsed.data;
  await updateDealer(user.dealer.id, { address: formatThaiAddress(address), shippingAddress: address, phone: phone || null });
  await audit(user.id, 'dealer.shipping.update', 'Dealer', user.dealer.id, { before: { address: user.dealer.address, phone: user.dealer.phone }, after: { address, phone } });
  revalidatePath('/shop', 'layout');
  await flash('บันทึกที่อยู่จัดส่งแล้ว', { icon: 'map', description: 'ใช้เป็นค่าเริ่มต้นในการสั่งซื้อครั้งถัดไป' });
  return { ok: true, message: 'บันทึกที่อยู่จัดส่งแล้ว' };
}

export type AvatarResult = { ok: boolean; message: string } | null;

/** Dealer (owner or staff) sets or removes the shop's profile picture (`remove=1`). */
export async function updateAvatarAction(_prev: AvatarResult, formData: FormData): Promise<AvatarResult> {
  const user = await requireDealerAccess();
  if (!user.dealer || isBackofficeRole(user.role as Role)) return { ok: false, message: 'แก้ไขได้เฉพาะบัญชีร้านดีลเลอร์' };
  const previous = user.dealer.avatarFile;
  let avatarFile: string | null = null;
  if (formData.get('remove') !== '1') {
    const file = formData.get('avatar');
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'เลือกรูปก่อน' };
    const saved = await saveAvatar(user.dealer.id, file);
    if (!saved.ok) return { ok: false, message: saved.reason };
    avatarFile = saved.name;
  }
  await updateDealer(user.dealer.id, { avatarFile });
  if (previous) await deleteAvatar(previous);
  await audit(user.id, avatarFile ? 'dealer.avatar.update' : 'dealer.avatar.remove', 'Dealer', user.dealer.id);
  revalidatePath('/shop', 'layout');
  revalidatePath('/admin/dealers');
  await flash(avatarFile ? 'อัปเดตรูปโปรไฟล์แล้ว' : 'ลบรูปโปรไฟล์แล้ว', { icon: 'image' });
  return { ok: true, message: avatarFile ? 'อัปเดตรูปโปรไฟล์แล้ว' : 'ลบรูปโปรไฟล์แล้ว' };
}
