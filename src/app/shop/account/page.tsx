import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, KeyRound, Store, Truck, Wallet } from 'lucide-react';
import { baht } from '@/lib/shop/catalog';
import { getCreditSummary } from '@/lib/shop/credit-line';
import { overdueLockMessage } from '@/lib/shop/credit';
import { currentTime, thaiDay } from '@/lib/admin/dashboard';
import { getSessionId } from '@/lib/shop/session';
import { listOrders } from '@/lib/shop/store';
import { creditOutstanding, canPayCredit } from '@/lib/shop/credit-payment';
import { Button } from '@/components/ui/button';
import { requireDealerAccess } from '@/lib/auth/session';
import { ROLE_LABELS, isBackofficeRole, type Role } from '@/lib/auth/roles';
import { getDealer } from '@/lib/dealers/repo';
import { getDealerProfile } from '@/lib/shop/dealer';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { DealerAvatar } from '@/components/shop/dealer-avatar';
import { TierShield } from '@/components/shop/tier-shield';
import { AddStaffForm } from './add-staff-form';
import { AvatarForm } from './avatar-form';
import { ShippingForm } from './shipping-form';
import { checkoutAddress } from '@/lib/shop/shipping-prefill';
import { LineLinkCard } from './line-link-card';
import { getLineConfig } from '@/lib/notify/line-config';

export const metadata: Metadata = { title: 'ข้อมูลร้าน' };

/** Dealer account: shop details set by the admin, login users of the shop, password change. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const [user, { line: lineStatus }] = await Promise.all([requireDealerAccess(), searchParams]);
  const profile = await getDealerProfile();
  const dealer = user.dealer && !isBackofficeRole(user.role as Role) ? await getDealer(user.dealer.id) : null;
  const lineConfig = dealer ? await getLineConfig() : null;
  const sid = await getSessionId();
  const [credit, orders] = await Promise.all([profile.credit ? getCreditSummary(profile) : null, listOrders(sid)]);
  const creditLine = credit?.line ?? null;
  // Web order behind each Odoo invoice (from the status sync), for the pay button and the PDF link.
  const orderOfInvoice = new Map(orders.flatMap((o) => (o.odoo?.progress?.invoices ?? []).filter((inv) => inv.id).map((inv) => [inv.id!, { orderId: o.id, orderRef: o.ref }] as const)));
  // Odoo reachable: every open invoice of the customer, also those keyed in Odoo, so the total matches Odoo.
  // Otherwise: the invoices of the shop's web orders from the last status sync.
  const openInvoices = credit?.openInvoices
    ? credit.openInvoices.filter((inv) => !inv.refund).map((inv) => ({ id: inv.id, name: inv.name, amountResidual: inv.residual, dueDate: inv.dueDate, ...(orderOfInvoice.get(inv.id) ?? { orderId: null, orderRef: inv.origin }) }))
    : orders.flatMap((o) => (o.odoo?.progress?.invoices ?? []).filter((inv) => inv.amountResidual > 0).map((inv) => ({ ...inv, orderId: o.id as string | null, orderRef: o.ref as string | null })))
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const openCreditOrders = orders.filter((o) => canPayCredit(o));
  const invoiceTotal = openInvoices.reduce((s, inv) => s + inv.amountResidual, 0);
  const outstandingTotal = credit?.odooReceivable ?? (openInvoices.length ? invoiceTotal : openCreditOrders.reduce((s, o) => s + creditOutstanding(o), 0));
  // Payments or credit notes Odoo has not matched to an invoice yet: why the invoice list and Total Receivable differ.
  const unapplied = credit?.odooReceivable != null ? Math.round((invoiceTotal - credit.odooReceivable) * 100) / 100 : 0;
  // Web credit orders not invoiced yet: counted in "ใช้ไปแล้ว" but not in Odoo's receivable.
  const notInvoiced = creditLine && credit?.odooReceivable != null ? Math.round((creditLine.used - credit.odooReceivable) * 100) / 100 : 0;
  const overdue = credit?.overdue ?? null;
  const today = thaiDay(currentTime());
  const usedPct = creditLine?.limit ? Math.min(100, Math.round((creditLine.used / creditLine.limit) * 100)) : 0;
  return (
    <div className="grid gap-6 md:grid-cols-2 md:items-start">
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-lg font-bold"><Store className="size-5" /> ข้อมูลร้าน</h1>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <DealerAvatar name={profile.name} avatarFile={profile.avatarFile} size={72} />
          <div className="min-w-0 space-y-2">
            <p className="truncate font-semibold">{profile.name}</p>
            <TierShield tier={profile.tier} withLabel />
            {dealer && <AvatarForm hasAvatar={!!profile.avatarFile} />}
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          <dt className="text-muted-foreground">ชื่อร้าน</dt><dd className="font-medium">{profile.name}</dd>
          <dt className="text-muted-foreground">ระดับ</dt><dd>{DEALER_TIER_LABELS[profile.tier]} <span className="text-xs text-muted-foreground">(แอดมินเป็นผู้กำหนด)</span></dd>
          <dt className="text-muted-foreground">จังหวัด</dt><dd>{profile.province.replace(/^จังหวัด/, '')}</dd>
          <dt className="text-muted-foreground">สินค้าที่สั่งได้</dt><dd>{profile.types.map((t: DealerType) => DEALER_TYPE_LABELS[t]).join(', ')}</dd>
          {!dealer && <><dt className="text-muted-foreground">ที่อยู่จัดส่ง</dt><dd>{profile.address || <span className="text-muted-foreground">ยังไม่ระบุ</span>}</dd></>}
        </dl>
        <p className="text-xs text-muted-foreground">ต้องการแก้ไขชื่อร้าน ระดับ หรือประเภทสินค้า แจ้งทีมขายทาง LINE</p>
      </section>

      {profile.credit && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><Wallet className="size-4" /> วงเงินเครดิต</h2>
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            {creditLine ? (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">ใช้ไปแล้ว</p>
                    <p className="text-2xl font-black">{baht(creditLine.used)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">คงเหลือ</p>
                    <p className={usedPct >= 90 ? 'text-lg font-bold text-destructive' : 'text-lg font-bold text-emerald-700 dark:text-emerald-400'}>{creditLine.limit === null ? 'ไม่จำกัด' : baht(Math.max(0, creditLine.limit - creditLine.used))}</p>
                  </div>
                </div>
                {creditLine.limit !== null && (
                  <>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="สัดส่วนวงเงินที่ใช้">
                      <div className={usedPct >= 90 ? 'h-full bg-destructive' : usedPct >= 70 ? 'h-full bg-amber-500' : 'h-full bg-emerald-500'} style={{ width: `${usedPct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">วงเงิน {baht(creditLine.limit)} · ใช้ไป {usedPct}%</p>
                  </>
                )}
              </>
            ) : <p className="text-muted-foreground">ยังไม่ได้กำหนดวงเงิน ติดต่อฝ่ายขาย</p>}
            {credit?.odooReceivable != null && (
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground tabular-nums">
                <dt>ยอดค้างชำระตามบัญชี (Odoo)</dt><dd className="text-right text-sm font-semibold text-foreground">{baht(credit.odooReceivable)}</dd>
                {notInvoiced > 0 && <><dt>ออเดอร์เครดิตบนเว็บที่ยังไม่ออกใบแจ้งหนี้</dt><dd className="text-right">{baht(notInvoiced)}</dd></>}
              </dl>
            )}
            {overdue && overdue.count > 0 && (
              <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {overdueLockMessage(overdue)}{overdue.source === 'web' && ' · นับจากออเดอร์บนเว็บ (ยังอ่านข้อมูลจาก Odoo ไม่ได้)'}
              </p>
            )}
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">ยอดค้างชำระรวม <span className="font-semibold text-foreground">{baht(outstandingTotal)}</span> · {openInvoices.length} ใบแจ้งหนี้{unapplied > 0 ? ` · มีรับชำระ/ลดหนี้ ${baht(unapplied)} ที่บัญชียังไม่ตัดกับใบแจ้งหนี้` : ''} · ยอดที่โอนแล้วรอตรวจจะหักเมื่อบัญชีลงรับใน Odoo</p>
          </div>
          {openInvoices.length > 0 && (
            <div className="rounded-xl border border-border bg-card text-sm">
              <h3 className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-semibold uppercase text-muted-foreground"><FileText className="size-3.5" /> ใบแจ้งหนี้ค้างชำระ</h3>
              <ul className="divide-y divide-border">
                {openInvoices.map((inv) => {
                  const late = inv.dueDate !== null && inv.dueDate.slice(0, 10) < today;
                  return (
                    <li key={`${inv.orderId ?? 'odoo'}-${inv.name}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{inv.name} {inv.orderRef && <span className="text-xs font-normal text-muted-foreground">· {inv.orderRef}</span>}</p>
                        <p className={late ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{inv.dueDate ? `${late ? 'เลยกำหนด' : 'ครบกำหนด'} ${new Date(inv.dueDate).toLocaleDateString('th-TH', { dateStyle: 'medium' })}` : 'ไม่ระบุวันครบกำหนด'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold">{baht(inv.amountResidual)}</span>
                        {inv.id && inv.orderId && <a href={`/api/orders/${inv.orderId}/invoice/${inv.id}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline">PDF</a>}
                        {inv.orderId
                          ? <Link href={`/shop/orders/${inv.orderId}#credit-payment`} className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">ชำระ</Link>
                          : <span className="text-[11px] text-muted-foreground">บิลจาก Odoo · ชำระกับฝ่ายบัญชี</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {dealer && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><Truck className="size-4" /> ที่อยู่จัดส่ง</h2>
          <ShippingForm address={profile.address} shipping={checkoutAddress(profile).address} phone={profile.phone} />
          <p className="text-xs text-muted-foreground">ใช้เป็นค่าเริ่มต้นตอนสั่งซื้อ แก้เฉพาะออเดอร์ได้ที่หน้าตะกร้า</p>
        </section>
      )}

      {dealer && lineConfig && (
        <LineLinkCard linked={Boolean(user.lineUserId)} linkedAt={user.lineLinkedAt} configured={Boolean(lineConfig.loginChannelId && lineConfig.loginChannelSecret && lineConfig.channelAccessToken)} basicId={lineConfig.basicId} status={lineStatus} />
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><KeyRound className="size-4" /> บัญชีของฉัน</h2>
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-muted-foreground">{user.email} · {ROLE_LABELS[user.role as Role]}</p>
          <Button nativeButton={false} render={<Link href="/account/password?next=/shop/account" />} variant="outline" size="sm" className="mt-3">เปลี่ยนรหัสผ่าน</Button>
        </div>
      </section>

      {dealer && (
        <section className="space-y-3">
          <h2 className="font-bold">ผู้ใช้ในร้าน</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {dealer.users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0"><p className="truncate font-medium">{u.name}</p><p className="truncate text-xs text-muted-foreground">{u.email}</p></div>
                <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[u.role as Role]}{!u.isActive && ' · ปิดใช้งาน'}</span>
              </li>
            ))}
          </ul>
          {user.role === 'DEALER_OWNER' && (
            <div className="rounded-xl border border-dashed border-border p-4">
              <p className="mb-2 text-sm font-medium">เพิ่มพนักงานร้าน</p>
              <AddStaffForm />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
