import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/notify/line-config', () => ({ getLineConfig: vi.fn(async () => ({ channelAccessToken: 'tok', adminGroupId: 'Cgroup', loginChannelId: '', loginChannelSecret: '', basicId: '@x' })) }));

const { flexCard, linePush } = await import('@/lib/notify/line');

describe('flexCard', () => {
  it('builds a bubble with title, body, rows and a button', () => {
    const card = flexCard({ title: 'ยืนยันออเดอร์แล้ว', body: 'WEB-1', rows: [{ label: 'ยอด', value: '1,000 บาท' }], button: { label: 'ดู', url: 'https://x/shop/orders/1' } });
    expect(card.type).toBe('flex');
    if (card.type !== 'flex') return;
    expect(card.altText).toContain('ยืนยันออเดอร์แล้ว');
    const contents = card.contents as { header: { contents: { text: string }[] }; footer?: { contents: { action: { uri: string } }[] } };
    expect(contents.header.contents[0].text).toBe('ยืนยันออเดอร์แล้ว');
    expect(contents.footer?.contents[0].action.uri).toBe('https://x/shop/orders/1');
  });

  it('omits the footer without a button', () => {
    const card = flexCard({ title: 't', body: 'b' });
    expect((card as { contents: Record<string, unknown> }).contents).not.toHaveProperty('footer');
  });
});

describe('linePush', () => {
  const fetchSpy = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchSpy); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); fetchSpy.mockReset(); });

  it('posts to the push endpoint with the bearer token', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(linePush('Uabc', [{ type: 'text', text: 'hi' }])).resolves.toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toMatchObject({ to: 'Uabc', messages: [{ type: 'text', text: 'hi' }] });
  });

  it('returns the LINE error instead of throwing', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: 'The property, \'to\', in the request body is invalid' }), { status: 400 }));
    const result = await linePush('bad', [{ type: 'text', text: 'hi' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('LINE 400');
  });

  it('refuses without a token or target, without calling LINE', async () => {
    await expect(linePush('', [{ type: 'text', text: 'x' }])).resolves.toMatchObject({ ok: false });
    await expect(linePush('U1', [{ type: 'text', text: 'x' }], '')).resolves.toMatchObject({ ok: false, error: expect.stringContaining('token') });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
