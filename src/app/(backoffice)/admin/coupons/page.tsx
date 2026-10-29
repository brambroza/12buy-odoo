import { Badge } from '@/components/ui/badge';
import { listCodePrograms } from '@/lib/odoo/loyalty';
import { requireAdmin } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  coupons: 'คูปอง (โค้ดใช้ครั้งเดียว)',
  promo_code: 'โค้ดส่วนลด',
  promotion: 'โปรโมชัน',
  buy_x_get_y: 'ซื้อ X แถม Y',
  next_order_coupons: 'คูปองครั้งถัดไป',
  gift_card: 'บัตรของขวัญ',
  ewallet: 'eWallet',
  loyalty: 'สะสมแต้ม',
};

/** Read-only overview of Odoo Loyalty programs dealers can use with a code. Coupons are created in Odoo. */
export default async function CouponsPage() {
  await requireAdmin();
  let programs: Awaited<ReturnType<typeof listCodePrograms>> = [];
  let error: string | null = null;
  try {
    programs = await listCodePrograms();
  } catch (e) {
    error = e instanceof Error ? e.message : 'อ่านข้อมูลจาก Odoo ไม่ได้';
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">คูปอง / โค้ดส่วนลด</h1>
        <p className="text-sm text-muted-foreground">สร้างและแก้ไขคูปองในเมนู Sales → Discount &amp; Loyalty ของ Odoo · หน้านี้แสดงโปรแกรมที่ร้านใช้ด้วยการกรอกโค้ดในตะกร้า</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">เว็บรองรับ</p>
        <p>โปรแกรมที่ใช้โค้ด (Trigger: with code) และมีรางวัลเป็นส่วนลด 1 แบบ: ลดเป็น % · ลดเป็นบาท · ลดตามแต้ม · ทั้งบิล / เฉพาะสินค้า-หมวดที่เลือก / ชิ้นที่ถูกที่สุด · ขั้นต่ำยอด/จำนวน · จำกัดวันที่ · จำกัดกลุ่มราคา (pricelist) · คูปองเฉพาะลูกค้า</p>
        <p>ยังไม่รองรับ: แถมสินค้า, ส่งฟรี, หลายรางวัลให้เลือก, เงื่อนไขสินค้าแบบ tag หรือ domain กำหนดเอง</p>
      </div>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!error && programs.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ยังไม่มีโปรแกรมที่ใช้โค้ดใน Odoo</p>}
      <div className="space-y-2">
        {programs.map(({ program, codes, couponCount, rewards }) => {
          const supported = rewards.length === 1 && rewards[0].reward_type === 'discount';
          return (
            <div key={program.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
              <span className={cn('font-medium', !program.active && 'text-muted-foreground line-through')}>{program.name}</span>
              <Badge variant="outline">{TYPE_LABELS[program.program_type] ?? program.program_type}</Badge>
              {!program.active && <Badge variant="outline" className="border-transparent bg-muted">ปิดใช้งาน</Badge>}
              <Badge variant="outline" className={cn('border-transparent', supported ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700')}>{supported ? 'ใช้บนเว็บได้' : 'ยังใช้บนเว็บไม่ได้'}</Badge>
              <span className="text-xs text-muted-foreground">
                {codes.length ? `โค้ด: ${codes.join(', ')}` : `${couponCount} คูปอง`}
                {program.date_to && ` · ถึง ${program.date_to.slice(0, 10)}`}
                {program.limit_usage && program.max_usage > 0 && ` · ใช้แล้ว ${program.total_order_count}/${program.max_usage}`}
                {program.pricelist_ids.length > 0 && ` · จำกัด ${program.pricelist_ids.length} pricelist`}
              </span>
              <span className="ml-auto text-xs">{rewards.map((r) => r.description || r.reward_type).join(' · ')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
