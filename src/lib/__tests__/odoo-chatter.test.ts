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
  let storedSize = 3;

  beforeEach(() => {
    calls.length = 0;
    fetchSpy.mockImplementation(async (_url: string, init: { body: string }) => {
      const { params } = JSON.parse(init.body) as { params: { method: string; args: unknown[] } };
      if (params.method === 'authenticate') return new Response(JSON.stringify({ jsonrpc: '2.0', result: 7 }));
      const [, , , model, method, args, kwargs] = params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
      calls.push({ model, method, args, kwargs });
      // Odoo 19: `ir.attachment` has `raw` but no `datas`; `read` reports the stored size.
      const result = method === 'fields_get' ? { raw: { type: 'binary' }, name: { type: 'char' } }
        : method === 'read' ? [{ id: 55, file_size: storedSize }]
          : method === 'create' ? 55 : 99;
      return new Response(JSON.stringify({ jsonrpc: '2.0', result }));
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

  it('uploads the slip through the content field this Odoo has, checks the size, then posts an HTML note with it', async () => {
    storedSize = 3;
    const id = await postNote('sale.order', 42, '<p>hi</p>', { name: 'slip.jpg', mimetype: 'image/jpeg', body: Buffer.from('abc') });
    expect(id).toBe(99);
    const writes = calls.filter((c) => c.method !== 'fields_get');
    expect(writes.map((c) => `${c.model}.${c.method}`)).toEqual(['ir.attachment.create', 'ir.attachment.read', 'sale.order.message_post']);
    expect(writes[0].args).toEqual([[{ name: 'slip.jpg', mimetype: 'image/jpeg', raw: Buffer.from('abc').toString('base64'), res_model: 'sale.order', res_id: 42 }]]);
    expect(writes[2].args).toEqual([[42]]);
    expect(writes[2].kwargs).toEqual({ body: '<p>hi</p>', body_is_html: true, message_type: 'comment', subtype_xmlid: 'mail.mt_note', attachment_ids: [55] });
  });

  it('fails loudly when Odoo stored an empty file instead of posting a note without the slip', async () => {
    storedSize = 0;
    await expect(postNote('sale.order', 42, '<p>hi</p>', { name: 'slip.jpg', mimetype: 'image/jpeg', body: Buffer.from('abc') })).rejects.toThrow('เก็บไฟล์สลิปไม่ครบ');
    expect(calls.some((c) => c.method === 'message_post')).toBe(false);
  });

  it('posts without an attachment on the invoice', async () => {
    await postNote('account.move', 9, '<p>x</p>', null);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: 'account.move', method: 'message_post', kwargs: { body: '<p>x</p>', body_is_html: true, subtype_xmlid: 'mail.mt_note' } });
    expect(calls[0].kwargs).not.toHaveProperty('attachment_ids');
  });
});
