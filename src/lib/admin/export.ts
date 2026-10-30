/**
 * CSV / XLSX export of admin lists. Pure builders: callers pick the rows (already filtered the way the
 * page shows them) and get bytes back. CSV carries a UTF-8 BOM so Thai text opens correctly in Excel.
 */
import ExcelJS from 'exceljs';
import type { Dealer } from '@/lib/db/types';
import { DEALER_TIER_LABELS, DEALER_TYPE_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type DealerType, type ProtoOrder } from '@/lib/shop/types';

export type ExportFormat = 'csv' | 'xlsx';
export type Column<T> = { header: string; value: (row: T) => string | number | null | undefined };

const BOM = '﻿';

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const text = String(v);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

export async function toXlsx<T>(rows: readonly T[], columns: readonly Column<T>[], sheet = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '12buy Dealer';
  const ws = wb.addWorksheet(sheet.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.header, width: Math.min(40, Math.max(12, c.header.length + 4)) }));
  for (const row of rows) ws.addRow(columns.map((c) => c.value(row) ?? ''));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Builds the response body + headers for a download in the chosen format. */
export async function exportFile<T>(rows: readonly T[], columns: readonly Column<T>[], name: string, format: ExportFormat): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'xlsx') return { body: await toXlsx(rows, columns, name), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${name}-${stamp}.xlsx` };
  return { body: Buffer.from(toCsv(rows, columns), 'utf8'), contentType: 'text/csv; charset=utf-8', filename: `${name}-${stamp}.csv` };
}

const thaiDate = (iso: string) => new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' });

/** One row per order. */
export const ORDER_COLUMNS: Column<ProtoOrder>[] = [
  { header: 'เลขออเดอร์', value: (o) => o.ref },
  { header: 'วันที่สั่ง', value: (o) => thaiDate(o.createdAt) },
  { header: 'ร้าน', value: (o) => o.dealerName },
  { header: 'สถานะ', value: (o) => ORDER_STATUS_LABELS[o.status] },
  { header: 'ชำระ', value: (o) => PAYMENT_METHOD_LABELS[o.paymentMethod] },
  { header: 'จำนวนรายการ', value: (o) => o.lines.length },
  { header: 'จำนวนหน่วย', value: (o) => o.lines.reduce((s, l) => s + l.qty, 0) },
  { header: 'รวมสินค้า', value: (o) => o.subtotal },
  { header: 'ส่วนลดเงินสด', value: (o) => o.cashDiscount },
  { header: 'คูปอง', value: (o) => o.coupon?.code ?? '' },
  { header: 'ส่วนลดคูปอง', value: (o) => o.couponDiscount },
  { header: 'ยอดสุทธิ', value: (o) => o.total },
  { header: 'PO ร้าน', value: (o) => o.poRef ?? '' },
  { header: 'ขนส่ง', value: (o) => o.carrier },
  { header: 'เลขพัสดุ', value: (o) => o.trackingRef ?? '' },
  { header: 'SO Odoo', value: (o) => o.odoo?.saleOrderName ?? '' },
  { header: 'สถานะ Odoo', value: (o) => o.odoo?.status ?? '' },
  { header: 'ใบแจ้งหนี้', value: (o) => o.odoo?.progress?.invoices.map((i) => i.name).join(' ') ?? '' },
  { header: 'ที่อยู่จัดส่ง', value: (o) => o.address },
  { header: 'หมายเหตุ', value: (o) => o.note },
];

export type OrderLineRow = { order: ProtoOrder; line: ProtoOrder['lines'][number] };

/** One row per order line (for product-level analysis). */
export const ORDER_LINE_COLUMNS: Column<OrderLineRow>[] = [
  { header: 'เลขออเดอร์', value: (r) => r.order.ref },
  { header: 'วันที่สั่ง', value: (r) => thaiDate(r.order.createdAt) },
  { header: 'ร้าน', value: (r) => r.order.dealerName },
  { header: 'สถานะ', value: (r) => ORDER_STATUS_LABELS[r.order.status] },
  { header: 'รหัสสินค้า', value: (r) => r.line.code },
  { header: 'ขนาด', value: (r) => r.line.size ?? '' },
  { header: 'สินค้า', value: (r) => r.line.name },
  { header: 'จำนวน', value: (r) => r.line.qty },
  { header: 'หน่วยขาย', value: (r) => r.line.unitName && r.line.unitQty ? `${r.line.unitQty} ${r.line.unitName}` : '' },
  { header: 'ราคา/หน่วย', value: (r) => r.line.unitPrice },
  { header: 'ส่วนลดเงินสด/หน่วย', value: (r) => r.line.cashDiscountPerUnit ?? 0 },
  { header: 'รวม', value: (r) => Math.round(r.line.qty * r.line.unitPrice * 100) / 100 },
];

export function orderLineRows(orders: readonly ProtoOrder[]): OrderLineRow[] {
  return orders.flatMap((order) => order.lines.map((line) => ({ order, line })));
}

/** One row per web dealer. */
export const DEALER_COLUMNS: Column<Dealer & { users?: { email: string }[] }>[] = [
  { header: 'ชื่อร้าน', value: (d) => d.name },
  { header: 'สถานะ', value: (d) => d.status },
  { header: 'ระดับ', value: (d) => DEALER_TIER_LABELS[d.tier] },
  { header: 'ประเภทสินค้า', value: (d) => d.types.map((t) => DEALER_TYPE_LABELS[t as DealerType]).join(', ') },
  { header: 'จังหวัด', value: (d) => d.province },
  { header: 'เลขผู้เสียภาษี', value: (d) => d.taxId ?? '' },
  { header: 'โทร', value: (d) => d.phone ?? '' },
  { header: 'LINE', value: (d) => d.lineId ?? '' },
  { header: 'ลูกค้า Odoo', value: (d) => d.odooPartnerId ?? '' },
  { header: 'เครดิต', value: (d) => (d.creditEnabled ? 'ใช่' : '') },
  { header: 'วงเงินเว็บ', value: (d) => (d.creditLimit == null ? '' : Number(d.creditLimit)) },
  { header: 'ยอดยกมา', value: (d) => Number(d.creditOpening ?? 0) },
  { header: 'ผู้ใช้', value: (d) => d.users?.map((u) => u.email).join(' ') ?? '' },
  { header: 'ที่อยู่', value: (d) => d.address ?? '' },
  { header: 'สมัครเมื่อ', value: (d) => thaiDate(d.createdAt.toISOString()) },
];

/** Price book entries joined with the catalog. */
export type PriceRow = { code: string; name: string; size: string; brand: string; type: string; price: number | null; base: number };
export const PRICE_COLUMNS: Column<PriceRow>[] = [
  { header: 'รหัสสินค้า', value: (r) => r.code },
  { header: 'ขนาด', value: (r) => r.size },
  { header: 'สินค้า', value: (r) => r.name },
  { header: 'ยี่ห้อ', value: (r) => r.brand },
  { header: 'ประเภท', value: (r) => r.type },
  { header: 'ราคาตาราง', value: (r) => r.price ?? '' },
  { header: 'ราคาฐาน Odoo', value: (r) => r.base },
];
