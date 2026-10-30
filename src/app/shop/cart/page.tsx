import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { baht, findProduct, getCatalog, getDealerCarrier } from '@/lib/shop/catalog';
import { getCreditLine } from '@/lib/shop/credit-line';
import { getWireTransferAccounts } from '@/lib/odoo/wire-transfer';
import { billTotals, cashDiscountPerUnit, cashPercentOf, resolvePrice, uniformCashPercent, withCoupon } from '@/lib/shop/pricing';
import { canSeeProduct, getDealerProfile } from '@/lib/shop/dealer';
import { checkCartCoupon } from '@/lib/shop/cart-coupon';
import { getSessionId } from '@/lib/shop/session';
import { getCart, getCartCoupon } from '@/lib/shop/store';
import { Input } from '@/components/ui/input';
import { describeQty, pickUnit } from '@/lib/shop/units';
import { requireDealerAccess } from '@/lib/auth/session';
import { isBackofficeRole, type Role } from '@/lib/auth/roles';
import { ThaiAddressFields } from '@/components/shop/thai-address-fields';
import { CartQtyStepper } from '@/components/shop/cart-qty-stepper';
import { CartUndoToast, ClearCartButton } from '@/components/shop/cart-undo';
import { CheckoutSummary } from '@/components/shop/checkout-summary';
import { applyCouponAction, changeCartUnitAction, checkoutAction, clearCartAction, removeCouponAction, restoreCartLineAction, updateCartQtyAction } from '../actions';

/** Cart and one-page checkout. */
export default async function CartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [profile, sid, catalog, user] = await Promise.all([getDealerProfile(), getSessionId(), getCatalog(), requireDealerAccess()]);
  const delivery = await getDealerCarrier(profile.odooPartnerId);
  const canSaveAddress = Boolean(user.dealer) && !isBackofficeRole(user.role as Role);
  const lines = (await getCart(sid))
    .map((item) => ({ item, product: findProduct(catalog, item.productId) }))
    .filter((l): l is { item: typeof l.item; product: NonNullable<typeof l.product> } => Boolean(l.product))
    .map((l) => ({ ...l, unit: resolvePrice(catalog, l.product, profile, l.item.qty), sale: pickUnit(l.product.units, l.item.unitId) }))
    .map((l) => ({ ...l, cashOff: cashDiscountPerUnit(catalog, l.product, profile, l.item.qty, l.unit), cashPercent: cashPercentOf(profile, l.product), allowed: canSeeProduct(profile, l.product) }));
  const billLines = lines.map((l) => ({ qty: l.item.qty, unitPrice: l.unit, cashDiscountPerUnit: l.cashOff, vatRate: l.product.vatRate, vatIncluded: l.product.vatIncluded }));
  const couponCode = await getCartCoupon(sid);
  const coupon = couponCode && lines.length
    ? await checkCartCoupon(couponCode, catalog, profile, lines.map((l) => ({ product: l.product, qty: l.item.qty, unitPrice: l.unit, cashDiscountPerUnit: l.cashOff })), profile.credit ? ['CREDIT', 'CASH'] : ['CASH'])
    : {};
  const couponOff = (method: 'CREDIT' | 'CASH') => { const r = coupon[method]; return r?.ok ? r.discount : 0; };
  const creditBill = withCoupon(billTotals(billLines, 'CREDIT'), couponOff('CREDIT'));
  const cashBill = withCoupon(billTotals(billLines, 'CASH'), couponOff('CASH'));
  const cashPercent = uniformCashPercent(lines.map((l) => ({ cashDiscountPerUnit: l.cashOff, cashDiscountPercent: l.cashPercent })));
  const couponResult = coupon[profile.credit ? 'CREDIT' : 'CASH'] ?? coupon.CASH;
  // Live: the tighter of the web limit and Odoo's credit_limit; Odoo unreachable leaves only the web limit.
  const [creditLine, bank] = await Promise.all([getCreditLine(profile), getWireTransferAccounts()]);
  const overStock = lines.find((l) => l.item.qty > l.product.qtyAvailable);
  const notAllowed = lines.find((l) => !l.allowed);

  if (!lines.length) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-lg font-semibold">ตะกร้าว่าง</p>
        <p className="text-sm text-muted-foreground">พิมพ์ขนาดยางที่หน้าแรก หรือใช้สั่งเร็ววางหลายรายการ</p>
        <div className="flex justify-center gap-2">
          <Button nativeButton={false} render={<Link href="/shop" />}>ค้นหาขนาด</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/shop/quick" />}>สั่งเร็ว</Button>
        </div>
        <CartUndoToast restore={restoreCartLineAction} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-lg:pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">ตะกร้า <span className="text-sm font-normal text-muted-foreground">{lines.length} รายการ</span></h1>
        <ClearCartButton count={lines.length} action={clearCartAction} />
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive">{error}</p>}

      <ul className="space-y-2">
        {lines.map(({ item, product, unit, sale, allowed, cashOff, cashPercent }, index) => (
          <li key={`${product.id}-${item.unitId ?? 'base'}`} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start gap-3">
              <Link href={`/shop/product/${product.id}`} className="shrink-0">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt={product.name} className="size-16 rounded-lg bg-muted object-cover md:size-20" loading="lazy" />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-lg bg-muted text-[11px] text-muted-foreground md:size-20">ไม่มีรูป</div>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                {product.size && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{product.size.label}</span>}
                <p className="truncate text-sm font-medium">{product.name}</p>
                <p className="text-xs text-muted-foreground">{baht(unit)} /{product.baseUnit}{sale.factor > 1 && <> · {baht(unit * sale.factor)} /{sale.name}</>}</p>
                <p className="text-xs font-medium">{describeQty(item.qty, product.baseUnit, sale, item.unitQty)}</p>
                {cashOff > 0 && <p className="text-xs text-emerald-700 dark:text-emerald-400">จ่ายเงินสดลด{cashPercent !== null ? ` ${cashPercent}%` : ''} −{baht(cashOff * item.qty)}</p>}
              </div>
              <p className="shrink-0 font-bold">{baht(unit * item.qty)}</p>
            </div>
            {(() => {
              const saleQty = sale.factor > 1 ? item.unitQty ?? Math.round(item.qty / sale.factor) : item.qty;
              return <CartQtyStepper key={`${item.unitId ?? 'base'}-${saleQty}`} productId={product.id} unitId={item.unitId ?? null} qty={saleQty} baseUnit={product.baseUnit} units={product.units.map((u) => (u.factor === 1 ? { ...u, name: product.baseUnit } : u))} stock={product.qtyAvailable} index={index} label={product.size?.label ?? product.name} action={updateCartQtyAction} changeUnit={changeCartUnitAction} />;
            })()}
            {!allowed && (
              <p className="mt-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" /> สินค้านี้ไม่อยู่ในรายการที่ร้านสั่งได้แล้ว ลบออกก่อนสั่ง
              </p>
            )}
            {item.qty > product.qtyAvailable && (() => {
              // Largest quantity in this line's unit that stock can cover; 0 means even one pack is too many.
              const fit = Math.floor(product.qtyAvailable / sale.factor);
              return (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  <span>มีในสต็อก {product.qtyAvailable} {product.baseUnit} สั่งเกินมา {item.qty - product.qtyAvailable} {product.baseUnit}</span>
                  {fit > 0 && (
                    <form action={updateCartQtyAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      {item.unitId && <input type="hidden" name="unitId" value={item.unitId} />}
                      <input type="hidden" name="qty" value={fit} />
                      <button type="submit" className="font-semibold underline underline-offset-2">ปรับเป็น {fit} {sale.factor > 1 ? sale.name : product.baseUnit}</button>
                    </form>
                  )}
                </div>
              );
            })()}
          </li>
        ))}
      </ul>

      </div>

      <div className="space-y-3 lg:sticky lg:top-24">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">โค้ดส่วนลด / คูปอง</h2>
        {couponCode ? (
          <div className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="font-mono font-semibold">{couponCode}</p>
              {couponResult?.ok
                ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{couponResult.programName} · {couponResult.label} · ลด {baht(couponResult.discount)}{profile.credit && creditBill.couponDiscount !== cashBill.couponDiscount ? ' (ยอดลดตามวิธีชำระ)' : ''}</p>
                : <p className="text-xs text-destructive">{couponResult?.reason ?? 'ใช้ไม่ได้'}</p>}
            </div>
            <form action={removeCouponAction}><Button type="submit" size="xs" variant="ghost">ลบโค้ด</Button></form>
          </div>
        ) : (
          <form action={applyCouponAction} className="flex gap-2">
            <Input name="code" placeholder="กรอกโค้ด" maxLength={64} autoComplete="off" className="h-9 font-mono" />
            <Button type="submit" variant="outline" size="sm" className="h-9">ใช้โค้ด</Button>
          </form>
        )}
      {/*   <p className="text-[11px] text-muted-foreground">ส่วนลดคิดตามโปรแกรมใน Odoo และออกเป็นบรรทัดส่วนลดในใบสั่งขาย</p> */}
      </div>
      <form action={checkoutAction} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">จัดส่งไปที่</h2>
        <ThaiAddressFields defaultValue={profile.shipping} legacyText={profile.shipping ? undefined : profile.address} />
        {canSaveAddress && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="saveAddress" className="size-4" /> บันทึกเป็นที่อยู่จัดส่งหลักของร้าน
          </label>
        )}
        <div className="text-sm">
          <span className="text-xs text-muted-foreground">การจัดส่ง</span>
          {delivery ? (
            <p className="mt-1 rounded-lg bg-muted/60 px-3 py-2">{delivery.carrier.name}<span className="block text-xs text-muted-foreground">{delivery.assigned ? 'ตามที่ฝ่ายขายกำหนดให้ร้าน' : 'ค่าเริ่มต้น'} · ต้องการเปลี่ยน ติดต่อฝ่ายขาย</span></p>
          ) : (
            <p className="mt-1 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">ยังไม่ได้กำหนดการจัดส่งให้ร้าน ติดต่อฝ่ายขาย</p>
          )}
        </div>
        <Textarea name="note" placeholder="หมายเหตุถึงฝ่ายขาย (ถ้ามี)" rows={2} className="text-sm" />
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">เลขที่ใบสั่งซื้อของร้าน (ไม่บังคับ)</span>
          <input name="poRef" maxLength={40} placeholder="เช่น PO-6811-023" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        </label>
        <CheckoutSummary bank={bank} credit={profile.credit} creditBill={creditBill} cashBill={cashBill} cashPercent={cashPercent} creditLine={creditLine} lineCount={lines.length} blocked={!delivery ? 'ยังไม่มีการจัดส่ง' : notAllowed ? 'ลบสินค้าที่สั่งไม่ได้ก่อน' : overStock ? 'แก้จำนวนก่อน' : couponCode && !couponResult?.ok ? 'ลบโค้ดที่ใช้ไม่ได้ก่อน' : null} />
       {/*  <p className="text-[11px] text-muted-foreground">ออเดอร์เข้า Odoo เมื่อฝ่ายขายยืนยัน</p> */}
      </form>
      </div>
      <CartUndoToast restore={restoreCartLineAction} />
    </div>
  );
}
