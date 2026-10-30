import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCreditPaymentNote, escapeHtml, postNote } from '@/lib/odoo/chatter';
import type { CreditPayment } from '@/lib/shop/types';

const order = { ref: 'WEB-20261030-0001', dealerName: 'ร้าน <ก> & ข', total: 5000 };
const payment: CreditPayment = { id: 'p1', slipFile: 'o1-a.jpg', amount: 1234.5, note: 'งวดแรก', uploadedAt: '2026-10-30T01:00:00Z', status: 'PENDING', reviewedAt: null };

describe('buildCreditPaymentNote', () => {
  it('describes a submitted transfer with the amount, remark and outstanding balance, HTML-escaped', () => {
    const html = buildCreditPaymentNote(order, payment, 'SUBMITTED', { outstanding: 5000 });
    expect(html).toContain('ดีลเลอร์แจ้งโอนชำระ');
    expect(html).toContain('WEB-20261030-0001');
    expect(html).toContain('ร้าน &lt;ก&gt; &amp; ข');
    expect(html).toContain('1,234.50 บาท');
    expect(html).toContain('ยอดค้างก่อนรายการนี้:</b> 5,000.00 บาท');
    expect(html).toContain('งวดแรก');
    expect(html).not.toContain('<ก>');
  });

  it('adds reviewer and reason on review notes', () => {
    const verified = buildCreditPaymentNote(order, { ...payment, status: 'VERIFIED', reviewedAt: '2026-10-30T02:00:00Z' }, 'VERIFIED', { reviewer: 'สมชาย' });
    expect(verified).toContain('ตรวจสลิปชำระเครดิตแล้ว');
    expect(verified).toContain('ตรวจโดย:</b> สมชาย');
    const rejected = buildCreditPaymentNote(order, { ...payment, status: 'REJECTED', reviewedAt: '2026-10-30T02:00:00Z', rejectReason: 'ยอดไม่ตรง' }, 'REJECTED');
    expect(rejected).toContain('ปฏิเสธสลิป');
    expect(rejected).toContain('เหตุผล:</b> ยอดไม่ตรง');
  });

  it('escapes HTML', () => {
    expect(escapeHtml('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  });
});

describe('postNote', () => {
  const fetchSpy = vi.fn();
  const calls: { model: string; method: string; args: unknown[]; kwargs: Record<string, unknown> }[] = [];

  beforeEach(() => {
    calls.length = 0;
    fetchSpy.mockImplementation(async (_url: string, init: { body: string }) => {
      const { params } = JSON.parse(init.body) as { params: { method: string; args: unknown[] } };
      if (params.method === 'authenticate') return new Response(JSON.stringify({ jsonrpc: '2.0', result: 7 }));
      const [, , , model, method, args, kwargs] = params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
      calls.push({ model, method, args, kwargs });
      return new Response(JSON.stringify({ jsonrpc: '2.0', result: method === 'create' ? 55 : 99 }));
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('ODOO_URL', 'https://odoo.test');
    vi.stubEnv('ODOO_DB', 'db');
    vi.stubEnv('ODOO_USERNAME', 'u');
    vi.stubEnv('ODOO_API_KEY', 'k');
    vi.stubEnv('ODOO_READ_ONLY', 'false');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchSpy.mockReset();
  });

  it('uploads the slip as an attachment of the record, then posts an internal note with it', async () => {
    const id = await postNote('sale.order', 42, '<p>hi</p>', { name: 'slip.jpg', mimetype: 'image/jpeg', body: Buffer.from('abc') });
    expect(id).toBe(99);
    expect(calls.map((c) => `${c.model}.${c.method}`)).toEqual(['ir.attachment.create', 'sale.order.message_post']);
    expect(calls[0].args).toEqual([[{ name: 'slip.jpg', mimetype: 'image/jpeg', datas: Buffer.from('abc').toString('base64'), res_model: 'sale.order', res_id: 42 }]]);
    expect(calls[1].args).toEqual([[42]]);
    expect(calls[1].kwargs).toEqual({ body: '<p>hi</p>', message_type: 'comment', subtype_xmlid: 'mail.mt_note', attachment_ids: [55] });
  });

  it('posts without an attachment on the invoice', async () => {
    await postNote('account.move', 9, '<p>x</p>', null);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: 'account.move', method: 'message_post', kwargs: { body: '<p>x</p>', subtype_xmlid: 'mail.mt_note' } });
    expect(calls[0].kwargs).not.toHaveProperty('attachment_ids');
  });
});
