import { NextResponse, type NextRequest } from 'next/server';
import { exportFile, type Column } from '@/lib/admin/export';
import { audit } from '@/lib/auth/audit';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/session';
import { excludedReasonOf, pickStepPercent, stepRangeLabel } from '@/lib/commission/calc';
import { fetchSales } from '@/lib/commission/odoo';
import { isPeriod, periodDates } from '@/lib/commission/period';
import { byRepAndGroup, commissionByInvoice, type InvoiceCommissionRow, type RepGroupRow } from '@/lib/commission/report';
import { getRun, getSource, listLedger, listPricelists, listSteps } from '@/lib/commission/repo';
import { clientFor, periodCalendar } from '@/lib/commission/service';
import { statementSettings } from '@/lib/commission/statement';
import { BONUS_BASE_LABELS, EXCLUDED_LABELS, OWNER_FROM_LABELS, PAYMENT_KIND_LABELS, PRICE_GROUP_LABELS, type LineResult, type RepResult, type StoredLedgerLine } from '@/lib/commission/types';

export const dynamic = 'force-dynamic';

type CollectionRow = StoredLedgerLine & { stepPercent: number | null; priceGroup: string; result?: LineResult };

const LEDGER_COLUMNS: Column<CollectionRow>[] = [
  { header: 'ประเภท', value: (r) => (r.kind === 'RETRO' ? `ปรับย้อนหลัง ${r.originPeriod}` : 'เงินเข้า') },
  { header: 'วันเงินเข้า', value: (r) => r.cashDate },
  { header: 'ใบเสร็จ/รายการเงินเข้า', value: (r) => r.receiptName },
  { header: 'ลูกค้า', value: (r) => r.partnerName },
  { header: 'ใบแจ้งหนี้', value: (r) => r.invoiceName },
  { header: 'วันที่ใบแจ้งหนี้', value: (r) => r.invoiceDate },
  { header: 'ครบกำหนด', value: (r) => r.dueDate },
  { header: 'เกินดิว (วัน)', value: (r) => r.overdueDays },
  { header: 'เงินสด/เครดิต', value: (r) => PAYMENT_KIND_LABELS[r.paymentKind] ?? '' },
  { header: 'ขั้น %', value: (r) => r.stepPercent },
  { header: 'พนักงานขาย', value: (r) => r.repName },
  { header: 'เจ้าของยอดจาก', value: (r) => OWNER_FROM_LABELS[r.ownerFrom] },
  { header: 'Pricelist', value: (r) => r.pricelistName },
  { header: 'กลุ่มราคา', value: (r) => r.priceGroup },
  { header: 'สินค้า', value: (r) => r.productName },
  { header: 'ยี่ห้อ', value: (r) => r.brand },
  { header: 'กลุ่มสินค้า', value: (r) => r.family },
  { header: 'หน่วย', value: (r) => r.qty },
  { header: 'รวม VAT', value: (r) => r.gross },
  { header: 'ก่อน VAT', value: (r) => r.base },
  { header: 'อัตรา', value: (r) => r.result?.rateLabel ?? '' },
  { header: '% ราคาพิเศษ', value: (r) => r.result?.specialPercent ?? '' },
  { header: 'ค่าคอม', value: (r) => (r.result ? Math.round(r.result.commission * 100) / 100 : '') },
  { header: 'ผล', value: (r) => { if (!r.result) return ''; const reason = excludedReasonOf(r, r.result); return reason ? `ไม่คิด: ${EXCLUDED_LABELS[reason]}` : 'นำมาคิด'; } },
  { header: 'ตรวจสอบ', value: (r) => r.issues.join(' · ') },
];

const REP_COLUMNS: Column<RepResult>[] = [
  { header: 'พนักงานขาย', value: (r) => r.repName },
  { header: 'รหัสพนักงาน (ติดลบ = tag Sale)', value: (r) => r.odooUserId },
  { header: 'ยอดเก็บ ก่อน VAT', value: (r) => r.base },
  { header: 'ยอดเก็บ รวม VAT', value: (r) => r.gross },
  { header: 'นำมาคิดค่าคอม ก่อน VAT', value: (r) => r.counted ?? r.base },
  ...(Object.keys(EXCLUDED_LABELS) as (keyof typeof EXCLUDED_LABELS)[]).map((reason): Column<RepResult> => ({
    header: `ไม่คิด: ${EXCLUDED_LABELS[reason]}`, value: (r) => r.excluded?.find((e) => e.reason === reason)?.base ?? 0,
  })),
  { header: 'เป้า', value: (r) => (r.target === null ? 'ยังไม่ตั้ง' : r.target) },
  { header: 'ถึงเป้า', value: (r) => (r.target === 0 ? 'ไม่ใช้เป้า' : r.targetMet ? 'ถึง' : 'ไม่ถึง') },
  { header: 'ค่าคอมตามอัตรา (ก่อนเป้า)', value: (r) => r.commissionBeforeTarget ?? r.commission },
  { header: 'ค่าคอม', value: (r) => r.commission },
  { header: 'คืนลูกหนี้ค้าง', value: (r) => r.debtRelease ?? 0 },
  { header: 'หักส่วนกลาง', value: (r) => -(r.central ?? 0) },
  { header: 'หักลูกหนี้ค้าง', value: (r) => -(r.debtHold ?? 0) },
  { header: 'ฐาน incentive', value: (r) => BONUS_BASE_LABELS[r.bonusBase ?? 'COLLECTION'] },
  { header: 'ยอดขายฐาน incentive ก่อน VAT', value: (r) => r.saleOrderBase ?? '' },
  { header: 'เอกสารขาย (ใบ)', value: (r) => r.saleOrderCount ?? '' },
  { header: 'ขั้นเงินพิเศษ', value: (r) => r.tier?.index ?? 0 },
  { header: 'เงินเดือนของขั้น', value: (r) => r.tier?.salary ?? '' },
  { header: 'เงินเดือนเซลล์', value: (r) => r.salary ?? '' },
  { header: 'Incentive (เงินพิเศษ)', value: (r) => r.tierBonus ?? 0 },
  { header: 'ลูกค้าใหม่ (ราย)', value: (r) => r.newCustomers?.length ?? 0 },
  { header: 'เงินลูกค้าใหม่', value: (r) => r.newCustomerBonus ?? 0 },
  { header: 'ปรับยอด', value: (r) => r.adjustments },
  { header: 'ยกมาหัก', value: (r) => r.carryIn },
  { header: 'จ่าย', value: (r) => r.payable },
  { header: 'ยกไปหัก', value: (r) => r.carryOut },
  { header: 'CN รอบนี้ ก่อน VAT (ไม่หัก)', value: (r) => r.creditNoteBase ?? 0 },
  { header: 'CN (ใบ)', value: (r) => r.creditNoteCount ?? 0 },
];

/** One row per rep with the statement rows as columns, in the order of the client's sheet. */
function statementColumns(reps: readonly RepResult[], debtDays: number): Column<RepResult>[] {
  const labels = new Map<string, string>();
  for (const rep of reps) for (const s of rep.summary ?? []) if (!labels.has(s.key)) labels.set(s.key, s.label);
  return [
    { header: 'พนักงานขาย', value: (r) => r.repName },
    ...[...labels].map(([key, label]): Column<RepResult> => ({ header: label, value: (r) => r.summary?.find((s) => s.key === key)?.amount ?? 0 })),
    { header: `คืนเงินลูกหนี้ค้างชำระ (+${debtDays + 1} วัน)`, value: (r) => r.debtRelease ?? 0 },
    { header: 'Incentive', value: (r) => r.tierBonus ?? 0 },
    { header: 'รวม', value: (r) => (r.subtotal ?? r.commission) + (r.tierBonus ?? 0) },
    { header: 'หัก ส่วนกลาง (ของค่าคอม)', value: (r) => -(r.central ?? 0) },
    { header: 'หัก ลูกหนี้ค้างชำระ', value: (r) => -(r.debtHold ?? 0) },
    { header: 'บวก ลูกค้าใหม่', value: (r) => r.newCustomerBonus ?? 0 },
    { header: 'ปรับปรุงอื่นๆ', value: (r) => r.adjustments },
    { header: 'ยอดติดลบยกมา', value: (r) => r.carryIn },
    { header: 'คงเหลือ', value: (r) => r.payable + r.carryOut },
    { header: 'จ่าย', value: (r) => r.payable },
    ...stepColumns(reps),
  ];
}

/** Commission per overdue step (e.g. "เกินดิว 0–10 วัน × 110%"), so the sheet shows what the steps did. */
function stepColumns(reps: readonly RepResult[]): Column<RepResult>[] {
  const keys = new Map<string, string>();
  for (const rep of reps) {
    for (const st of rep.steps ?? []) {
      const key = `${st.noSteps ? 'no-steps:' : ''}${st.minDays}-${st.maxDays}-${st.percent}`;
      if (!keys.has(key)) keys.set(key, st.noSteps ? 'ไม่ได้ตั้งขั้นบันได × 100%' : `เกินดิว ${stepRangeLabel(st.minDays === null ? null : { minDays: st.minDays, maxDays: st.maxDays })} × ${st.percent}%`);
    }
  }
  return [...keys].map(([key, header]): Column<RepResult> => ({
    header, value: (r) => r.steps?.find((st) => `${st.noSteps ? 'no-steps:' : ''}${st.minDays}-${st.maxDays}-${st.percent}` === key)?.commission ?? 0,
  }));
}

const INVOICE_COLUMNS: Column<InvoiceCommissionRow>[] = [
  { header: 'พนักงานขาย', value: (r) => r.repName },
  { header: 'ประเภท', value: (r) => (r.kind === 'RETRO' ? 'ปรับย้อนหลัง' : 'เงินเข้า') },
  { header: 'ใบแจ้งหนี้', value: (r) => r.invoiceName ?? 'ไม่ใช่ใบแจ้งหนี้' },
  { header: 'วันที่ใบแจ้งหนี้', value: (r) => r.invoiceDate },
  { header: 'ลูกค้า', value: (r) => r.partnerName },
  { header: 'ใบเสร็จ/รายการเงินเข้า', value: (r) => r.receipts.join(', ') },
  { header: 'วันเงินเข้า (ล่าสุด)', value: (r) => r.cashDate },
  { header: 'ครบกำหนด', value: (r) => r.dueDate },
  { header: 'เกินดิว (วัน)', value: (r) => r.overdueDays },
  { header: 'ยี่ห้อ-กลุ่มสินค้า', value: (r) => r.families.join(', ') },
  { header: 'หน่วย', value: (r) => r.qty },
  { header: 'รวม VAT', value: (r) => r.gross },
  { header: 'ก่อน VAT', value: (r) => r.base },
  { header: 'นำมาคิดค่าคอม ก่อน VAT', value: (r) => r.counted },
  { header: 'ค่าคอม (ก่อนเป้า/ส่วนกลาง)', value: (r) => r.commission },
];

const SALES_COLUMNS: Column<RepGroupRow>[] = [
  { header: 'พนักงานขาย', value: (r) => r.repName },
  { header: 'กลุ่มราคา', value: (r) => (r.priceGroup === 'UNMAPPED' ? 'ยังไม่จัดกลุ่ม' : PRICE_GROUP_LABELS[r.priceGroup]) },
  { header: 'ยี่ห้อ-กลุ่มสินค้า', value: (r) => r.family },
  { header: 'หน่วย', value: (r) => r.qty },
  { header: 'ยอดขาย ก่อน VAT', value: (r) => r.base },
  { header: 'ยอดขาย รวม VAT', value: (r) => r.gross },
  { header: 'ในนั้นราคาพิเศษ', value: (r) => r.special },
];

/**
 * Excel / CSV of the commission module: `kind=collections` (cash-in lines with invoice, due date,
 * days overdue), `kind=run` (per-rep result sheet; lines with the rule used come as `kind=run-lines`, one row per
 * rep × invoice as `kind=run-invoices`),
 * `kind=sales` (sales per rep × price group × family, read live from Odoo). Needs `commission.view`.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role as Role, 'commission.view')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const kind = sp.get('kind') ?? '';
  const period = sp.get('period') ?? '';
  const format = sp.get('format') === 'csv' ? 'csv' : 'xlsx';
  if (!['collections', 'run', 'run-lines', 'run-invoices', 'sales', 'statement'].includes(kind) || !isPeriod(period)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const source = await getSource(sp.get('source') ?? '');
  if (!source) return NextResponse.json({ error: 'source not found' }, { status: 404 });
  const name = `commission-${source.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${period}`;
  let file: Awaited<ReturnType<typeof exportFile>>;
  let count: number;

  if (kind === 'sales') {
    const [lines, pricelists] = await Promise.all([fetchSales(clientFor(source), period, periodDates(await periodCalendar(source), period)), listPricelists(source.id)]);
    const rows = byRepAndGroup(lines, pricelists);
    count = rows.length;
    file = await exportFile(rows, SALES_COLUMNS, `${name}-sales`, format);
  } else if (kind === 'run' || kind === 'statement') {
    const run = await getRun(source.id, period);
    const reps = run?.results?.reps ?? [];
    count = reps.length;
    const debtDays = (run?.snapshot?.statement ?? statementSettings(source)).debtDays;
    file = kind === 'run'
      ? await exportFile(reps, REP_COLUMNS, `${name}-run`, format)
      : await exportFile([...reps].sort((a, b) => a.repName.localeCompare(b.repName, 'th')), statementColumns(reps, debtDays), `${name}-statement`, format);
  } else if (kind === 'run-invoices') {
    const [ledger, run] = await Promise.all([listLedger(source.id, period), getRun(source.id, period)]);
    const results = new Map((run?.results?.lines ?? []).map((l) => [l.lineKey, l]));
    const rows = commissionByInvoice(ledger, results).sort((a, b) => (a.repName ?? '').localeCompare(b.repName ?? '', 'th') || b.base - a.base);
    count = rows.length;
    file = await exportFile(rows, INVOICE_COLUMNS, `${name}-invoices`, format);
  } else {
    const [ledger, steps, pricelists, run] = await Promise.all([listLedger(source.id, period), listSteps(source.id), listPricelists(source.id), getRun(source.id, period)]);
    const groups = new Map(pricelists.map((p) => [p.odooPricelistId, `${PRICE_GROUP_LABELS[p.priceGroup]}${p.isSpecial ? ' (พิเศษ)' : ''}`]));
    const results = new Map((run?.results?.lines ?? []).map((l) => [l.lineKey, l]));
    const rows: CollectionRow[] = ledger.map((l) => ({
      ...l, stepPercent: l.invoiceId ? pickStepPercent(steps, l.overdueDays ?? 0, l.cashDate) : null,
      priceGroup: l.pricelistId !== null ? groups.get(l.pricelistId) ?? 'ยังไม่จัดกลุ่ม' : '', result: kind === 'run-lines' ? results.get(l.lineKey) : undefined,
    }));
    count = rows.length;
    file = await exportFile(rows, kind === 'run-lines' ? LEDGER_COLUMNS : LEDGER_COLUMNS.slice(0, -3).concat(LEDGER_COLUMNS.slice(-1)), `${name}-${kind}`, format);
  }
  await audit(user.id, 'export', `commission-${kind}`, format, { source: source.id, period, count });
  return new NextResponse(new Uint8Array(file.body), { headers: { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, 'Cache-Control': 'private, no-store' } });
}
