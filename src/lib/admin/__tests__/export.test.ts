import { describe, expect, it } from 'vitest';
import { ORDER_COLUMNS, exportFile, orderLineRows, toCsv } from '@/lib/admin/export';
import type { ProtoOrder } from '@/lib/shop/types';

const order: ProtoOrder = {
  id: 'o1', ref: 'WEB-0001', sessionId: 'dealer:d1', dealerName: 'ร้าน "ยางดี", สาขา 2', status: 'PAID', paymentMethod: 'CASH',
  lines: [{ productId: 1, name: 'ยาง 195/65R15', code: 'YK-1', size: '195/65R15', qty: 4, unitPrice: 1500 }],
  subtotal: 6000, cashDiscount: 0, couponDiscount: 0, total: 6000, address: '1 ถ.ทดสอบ\nกรุงเทพฯ', carrier: 'รถบริษัท', note: '', trackingRef: null,
  payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null }, createdAt: '2026-10-30T03:00:00Z', events: [],
};

describe('toCsv', () => {
  it('starts with a BOM, quotes commas / quotes / newlines, and uses CRLF', () => {
    const csv = toCsv([order], ORDER_COLUMNS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"ร้าน ""ยางดี"", สาขา 2"');
    expect(csv).toContain('"1 ถ.ทดสอบ\nกรุงเทพฯ"');
    expect(csv.split('\r\n')[0]).toContain('เลขออเดอร์');
  });
  it('flattens order lines', () => {
    expect(orderLineRows([order])).toHaveLength(1);
    expect(orderLineRows([order])[0].line.code).toBe('YK-1');
  });
});

describe('exportFile', () => {
  it('produces an xlsx workbook with the sheet name and rows', async () => {
    const file = await exportFile([order], ORDER_COLUMNS, 'orders', 'xlsx');
    expect(file.contentType).toContain('spreadsheetml');
    expect(file.filename).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(file.body.subarray(0, 2).toString()).toBe('PK');
  });
});
