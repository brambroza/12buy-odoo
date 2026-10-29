'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit } from '@/lib/auth/audit';
import { requireAdmin } from '@/lib/auth/session';
import { flash } from '@/lib/flash';
import { getOdooCustomer, listOdooPricelists, parseCustomerCarrier, parseCustomerPricingForm, updateOdooCustomerPricing } from '@/lib/odoo/customer-pricing';
import { listAllCarriers } from '@/lib/odoo/delivery-carrier';
import { odooWritesEnabled } from '@/lib/odoo/rpc';
import { clearPartnerCache } from '@/lib/shop/catalog';

/**
 * Row on the dealers page to reopen after a save: the web dealer when the form came from one
 * (`open=<id>`), otherwise the Odoo-only customer row (`open=odoo-<partnerId>`), whose drawer then reopens.
 */
function customerRowLink(partnerId: number | string, dealerId: string | null, extra = ''): string {
  const row = dealerId ? dealerId : `odoo-${partnerId}`;
  return `/admin/dealers?open=${encodeURIComponent(row)}${extra}`;
}

/** Sets an Odoo customer's pricelist (price group), credit limit and delivery method on the Odoo partner itself. */
export async function updateOdooCustomerAction(formData: FormData) {
  const actor = await requireAdmin();
  const partnerId = Number(formData.get('partnerId'));
  const dealerId = String(formData.get('dealerId') ?? '').trim() || null;
  const back = (extra = '') => customerRowLink(partnerId, dealerId, extra);
  function fail(message: string): never {
    redirect(back(`&error=${encodeURIComponent(message)}`));
  }
  if (!Number.isInteger(partnerId) || partnerId <= 0) redirect('/admin/dealers?error=' + encodeURIComponent('ไม่พบลูกค้า'));
  if (!odooWritesEnabled()) fail('Odoo อยู่ในโหมดอ่านอย่างเดียว (ODOO_READ_ONLY) จึงยังบันทึกไม่ได้');

  const [before, pricelists, carriers] = await Promise.all([getOdooCustomer(partnerId), listOdooPricelists(), listAllCarriers()]);
  if (!before) fail('ไม่พบลูกค้านี้ใน Odoo');
  const parsed = parseCustomerPricingForm(
    { pricelistId: String(formData.get('pricelistId') ?? ''), creditLimit: String(formData.get('creditLimit') ?? '') },
    new Set(pricelists.map((p) => p.id)),
  );
  if (!parsed.ok) fail(parsed.error);
  const carrier = parseCustomerCarrier(String(formData.get('carrierId') ?? ''), new Set([...carriers.filter((c) => c.active).map((c) => c.id), ...(before.carrier ? [before.carrier.id] : [])]));
  if (!carrier.ok) fail(carrier.error);
  const update = { ...parsed.update, carrierId: carrier.carrierId };

  try {
    await updateOdooCustomerPricing(partnerId, update);
  } catch (error) {
    console.error('[admin/dealers] Odoo write failed', partnerId, error instanceof Error ? error.message : error);
    fail(`บันทึกลง Odoo ไม่สำเร็จ: ${error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'}`);
  }
  await audit(actor.id, 'odoo.customer_pricing', 'res.partner', String(partnerId), {
    from: { pricelistId: before.pricelist?.id ?? null, creditLimit: before.creditLimit, carrierId: before.carrier?.id ?? null },
    to: update,
  });
  // Dealer profiles and the checkout read the partner's pricelist and delivery method from the cached partner list.
  clearPartnerCache();
  revalidatePath('/admin', 'layout');
  revalidatePath('/shop', 'layout');
  const pricelistName = pricelists.find((p) => p.id === update.pricelistId)?.name ?? `#${update.pricelistId}`;
  const carrierName = carriers.find((c) => c.id === update.carrierId)?.name ?? 'จัดส่งค่าเริ่มต้น';
  await flash('บันทึกลง Odoo แล้ว', {
    icon: 'price',
    description: `${before.name} · ${pricelistName} · ${update.creditLimit === null ? 'ไม่จำกัดวงเงิน' : `วงเงิน ${update.creditLimit.toLocaleString('th-TH')} บาท`} · ${carrierName}`,
  });
  redirect(back('&saved=1'));
}
