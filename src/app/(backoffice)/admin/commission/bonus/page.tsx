import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionHeader, NoSource, Notice } from '@/components/admin/commission-header';
import { EmptyRow, TableCard } from '@/components/admin/list-kit';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { requirePermission } from '@/lib/auth/session';
import { JFC_2569_TIERS } from '@/lib/commission/bonus';
import { commissionContext } from '@/lib/commission/context';
import { monthName, thaiDay } from '@/lib/commission/period';
import { periodNewCustomers } from '@/lib/commission/service';
import { saveBonusAction } from '../actions';

const PATH = '/admin/commission/bonus';
const input = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums';
const baht = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const MAX_TIERS = 20;
type Search = { source?: string; period?: string; saved?: string; error?: string };

/**
 * Bonuses paid on top of commission: the sales-bonus ladder on collections ("เงินพิเศษ") and the
 * amount per new customer, plus the new customers found in the chosen period.
 */
export default async function CommissionBonusPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission('commission.view');
  const params = await searchParams;
  const ctx = await commissionContext(params);
  const source = ctx.source;
  const title = 'เงินพิเศษ / ลูกค้าใหม่';
  if (!source) return <div className="space-y-4"><CommissionHeader ctx={ctx} path={PATH} title={title} /><NoSource /></div>;

  const canManage = can(user.role as Role, 'commission.manage');
  const tiers = source.bonusTiers;
  const rowCount = Math.min(MAX_TIERS, Math.max(tiers.length + 3, 10));
  const newCustomers = await periodNewCustomers(source.id, ctx.period);

  return (
    <div className="space-y-4">
      <CommissionHeader ctx={ctx} path={PATH} title={title}
        description="จ่ายเพิ่มจากค่าคอม ไม่โดนหักส่วนกลาง · ลูกค้าใหม่ได้เฉพาะเซลล์ที่ถึงเป้า · มีผลเมื่อกดคำนวณรอบที่ยังเป็นร่าง (เปลี่ยนฐานแล้วกดดึงข้อมูลใหม่ก่อน)" />
      <Notice saved={params.saved} error={params.error} />

      <form action={saveBonusAction} className="space-y-4">
        <input type="hidden" name="source" value={source.id} />
        <input type="hidden" name="period" value={ctx.period} />

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="font-semibold">ขั้นเงินพิเศษ (incentive)</h2>
            <fieldset className="mt-2 flex flex-wrap gap-2 text-sm" disabled={!canManage}>
              <legend className="mb-1 text-xs font-medium">วัดขั้นจาก</legend>
              {([
                ['COLLECTION', 'ยอดเก็บ (เงินเข้า)', 'ยอดเดียวกับที่ใช้วัดเป้า · ได้เฉพาะเมื่อถึงเป้า'],
                ['INVOICE', 'ยอดขายตามใบแจ้งหนี้ Odoo', 'ใบแจ้งหนี้ที่ลงบัญชีแล้วตามวันที่ใบแจ้งหนี้ในรอบ ก่อน VAT หักใบลดหนี้ของรอบ ทุกสินค้า · ไม่ต้องถึงเป้า · ค่าคอมยังคิดจากยอดเก็บเหมือนเดิม'],
                ...(source.bonusBase === 'SALE_ORDER' ? [['SALE_ORDER', 'ยอดขายจากใบสั่งขาย Odoo (เดิม)', 'ใบสั่งขายที่ยืนยันแล้วตามวันที่สั่ง · เปลี่ยนเป็นใบแจ้งหนี้แทนได้'] as const] : []),
              ] as const).map(([value, label, hint]) => (
                <label key={value} className="flex max-w-sm cursor-pointer items-start gap-2 rounded-lg border border-border p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" name="bonusBase" value={value} defaultChecked={source.bonusBase === value} className="mt-1" />
                  <span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
                </label>
              ))}
            </fieldset>
            <p className="mt-2 text-sm text-muted-foreground">
              ยอดของเซลล์ในรอบถึงขั้นไหน คิดจากขั้นสูงสุดที่ถึงขั้นเดียว · ต่ำกว่าขั้นแรกได้ 0 · เว้นยอดว่างเพื่อลบขั้น
              <span className="block">มีเงินเดือนของขั้น: เงินพิเศษ = เงินเดือนของขั้นที่ถึง − เงินเดือนเซลล์รอบนั้น (ตั้งที่หน้าเป้า) ต่ำกว่า 0 ได้ 0 · เว้นเงินเดือนว่างทุกขั้น: จ่ายตามช่องเงินพิเศษ</span>
            </p>
          </div>
          <TableCard>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-12">ขั้น</TableHead>
                  <TableHead className="text-right">ยอดตั้งแต่ (บาท ก่อน VAT)</TableHead>
                  <TableHead className="text-right">เงินเดือนของขั้น (บาท)</TableHead>
                  <TableHead className="text-right">เงินพิเศษ (บาท) · ใช้เมื่อไม่มีเงินเดือน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: rowCount }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell data-label="ขั้น" className="tabular-nums">{i + 1}</TableCell>
                    <TableCell data-label="ยอดเก็บตั้งแต่">
                      <input name={`min_${i}`} defaultValue={tiers[i] ? baht.format(tiers[i].minAmount) : ''} inputMode="decimal" disabled={!canManage} aria-label={`ยอดเก็บขั้น ${i + 1}`} className={input} />
                    </TableCell>
                    <TableCell data-label="เงินเดือนของขั้น">
                      <input name={`salary_${i}`} defaultValue={tiers[i]?.salary ? baht.format(tiers[i].salary!) : ''} inputMode="decimal" disabled={!canManage} aria-label={`เงินเดือนขั้น ${i + 1}`} className={input} />
                    </TableCell>
                    <TableCell data-label="เงินพิเศษ">
                      <input name={`bonus_${i}`} defaultValue={tiers[i] ? baht.format(tiers[i].bonus) : ''} inputMode="decimal" disabled={!canManage} aria-label={`เงินพิเศษขั้น ${i + 1}`} className={input} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          {canManage && (
            <p className="text-xs text-muted-foreground">
              ตาราง JFC SOLUTION 2569: {JFC_2569_TIERS.length} ขั้น เริ่ม {baht.format(JFC_2569_TIERS[0].minAmount)} ขั้นละ 300,000 ถึง {baht.format(JFC_2569_TIERS.at(-1)!.minAmount)} ·{' '}
              <Button type="submit" name="preset" value="jfc2569" variant="link" className="h-auto p-0 text-xs">ใช้ตารางนี้</Button>
              {' '}(แทนขั้นที่กรอกไว้)
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="font-semibold">ลูกค้าใหม่</h2>
            <p className="text-sm text-muted-foreground">
              ลูกค้าที่สร้างใน Odoo ตั้งแต่วันเริ่มนับ และบิลแรกของลูกค้ามีเงินเข้าในรอบนั้น นับให้เซลล์ของบิลนั้น (tag &quot;Sale …&quot;) รายละครั้งเดียว · ลูกค้าหลายสาขานับเป็นรายเดียว
            </p>
          </div>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium">เงินต่อลูกค้าใหม่ 1 ราย (บาท)
              <input name="newCustomerBonus" defaultValue={source.newCustomerBonus ? baht.format(source.newCustomerBonus) : ''} placeholder="300" inputMode="decimal" disabled={!canManage} className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium">นับลูกค้าที่สร้างใน Odoo ตั้งแต่วันที่
              <input type="date" name="newCustomerFrom" defaultValue={source.newCustomerFrom ?? ''} disabled={!canManage} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" />
            </label>
          </div>
          <p className="text-xs text-amber-800">
            Odoo เริ่มใช้งาน ก.ย. 69 ลูกค้าเดิมที่ย้ายเข้ามาก็มีบิลแรกใน Odoo ช่วงนั้น ให้ตั้งวันเริ่มนับหลังวันที่ย้ายลูกค้าเดิมเข้า Odoo เสร็จ · เว้นว่าง = ไม่จ่ายลูกค้าใหม่ ·
            เปลี่ยนวันแล้วต้องกดดึงข้อมูลรอบนั้นใหม่
          </p>
        </section>

        {canManage ? <Button type="submit">บันทึก</Button> : <p className="text-xs text-muted-foreground">เฉพาะผู้มีสิทธิ์ตั้งค่าค่าคอมแก้ได้</p>}
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold">ลูกค้าใหม่รอบ {monthName(ctx.period)} <span className="text-sm font-normal text-muted-foreground">({newCustomers.length} ราย · จากการดึงข้อมูลครั้งล่าสุด)</span></h2>
        <TableCard>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>สร้างใน Odoo</TableHead>
                <TableHead>บิลแรก</TableHead>
                <TableHead>เงินเข้า</TableHead>
                <TableHead>เซลล์</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newCustomers.length === 0 && <EmptyRow colSpan={5}>{source.newCustomerFrom ? 'ไม่มีลูกค้าใหม่ในรอบนี้ (หรือยังไม่ได้ดึงข้อมูลรอบนี้)' : 'ยังไม่ได้ตั้งวันเริ่มนับลูกค้าใหม่'}</EmptyRow>}
              {newCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell data-label="ลูกค้า" className="font-medium">{c.partnerName}</TableCell>
                  <TableCell data-label="สร้างใน Odoo">{c.partnerCreated ? thaiDay(c.partnerCreated) : '—'}</TableCell>
                  <TableCell data-label="บิลแรก">{c.invoiceName}</TableCell>
                  <TableCell data-label="เงินเข้า">{thaiDay(c.cashDate)}</TableCell>
                  <TableCell data-label="เซลล์">{c.repName ?? <span className="text-destructive">ไม่มีเซลล์</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>
    </div>
  );
}
