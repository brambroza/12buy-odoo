import Link from 'next/link';
import { KeyRound, Store, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requireDealerAccess } from '@/lib/auth/session';
import { ROLE_LABELS, isBackofficeRole, type Role } from '@/lib/auth/roles';
import { getDealer } from '@/lib/dealers/repo';
import { getDealerProfile } from '@/lib/shop/dealer';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';
import { AddStaffForm } from './add-staff-form';
import { ShippingForm } from './shipping-form';

/** Dealer account: shop details set by the admin, login users of the shop, password change. */
export default async function AccountPage() {
  const user = await requireDealerAccess();
  const profile = await getDealerProfile();
  const dealer = user.dealer && !isBackofficeRole(user.role as Role) ? await getDealer(user.dealer.id) : null;
  return (
    <div className="grid gap-6 md:grid-cols-2 md:items-start">
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-lg font-bold"><Store className="size-5" /> ข้อมูลร้าน</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          <dt className="text-muted-foreground">ชื่อร้าน</dt><dd className="font-medium">{profile.name}</dd>
          <dt className="text-muted-foreground">ระดับ</dt><dd>{DEALER_TIER_LABELS[profile.tier]}</dd>
          <dt className="text-muted-foreground">จังหวัด</dt><dd>{profile.province.replace(/^จังหวัด/, '')}</dd>
          <dt className="text-muted-foreground">สินค้าที่สั่งได้</dt><dd>{profile.types.map((t: DealerType) => DEALER_TYPE_LABELS[t]).join(', ')}</dd>
          {!dealer && <><dt className="text-muted-foreground">ที่อยู่จัดส่ง</dt><dd>{profile.address || <span className="text-muted-foreground">ยังไม่ระบุ</span>}</dd></>}
        </dl>
        <p className="text-xs text-muted-foreground">ต้องการแก้ไขชื่อร้าน ระดับ หรือประเภทสินค้า แจ้งทีมขายทาง LINE</p>
      </section>

      {dealer && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><Truck className="size-4" /> ที่อยู่จัดส่ง</h2>
          <ShippingForm address={profile.address} shipping={profile.shipping} phone={profile.phone} />
          <p className="text-xs text-muted-foreground">ใช้เป็นค่าเริ่มต้นตอนสั่งซื้อ แก้เฉพาะออเดอร์ได้ที่หน้าตะกร้า</p>
        </section>
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
