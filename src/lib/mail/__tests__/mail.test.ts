import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { envMailConfig, invalidateMailConfig, mailConfigured, parsePort, parseSecure, type MailConfig } from '../config';
import { sendMail, setMailTransportFactory, verifyMailConfig, type MailTransport } from '../send';
import { escapeHtml, tempPasswordEmail, testEmail } from '../templates';

const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

const full: MailConfig = { host: 'smtp.example.com', port: 587, secure: false, user: 'u', pass: 'p', from: 'Shop <no-reply@example.com>', source: 'env', updatedAt: null, updatedById: null, savedError: null };

describe('mail config (env)', () => {
  beforeEach(() => { setEnv({}); invalidateMailConfig(); });
  afterEach(() => { setEnv({}); invalidateMailConfig(); });

  it('parses ports and falls back by security mode', () => {
    expect(parsePort('2525', false)).toBe(2525);
    expect(parsePort('', false)).toBe(587);
    expect(parsePort('abc', true)).toBe(465);
    expect(parsePort('70000', false)).toBe(587);
  });

  it('derives secure from SMTP_SECURE, else from port 465', () => {
    expect(parseSecure('true', '587')).toBe(true);
    expect(parseSecure('0', '465')).toBe(false);
    expect(parseSecure(undefined, '465')).toBe(true);
    expect(parseSecure('', '587')).toBe(false);
  });

  it('reads SMTP_* env and defaults the sender to SMTP_USER', () => {
    setEnv({ SMTP_HOST: ' smtp.gmail.com ', SMTP_PORT: '465', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'app-pass' });
    const config = envMailConfig();
    expect(config).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, user: 'me@gmail.com', pass: 'app-pass', from: 'me@gmail.com', source: 'env' });
    expect(mailConfigured(config)).toBe(true);
  });

  it('is not configured without a host', () => {
    setEnv({ MAIL_FROM: 'x@y.com' });
    expect(mailConfigured(envMailConfig())).toBe(false);
  });
});

describe('sendMail', () => {
  const sent: unknown[] = [];
  const transport: MailTransport = {
    sendMail: vi.fn(async (message) => { sent.push(message); return { messageId: '<id-1>' }; }),
    verify: vi.fn(async () => true),
  };

  beforeEach(() => { sent.length = 0; vi.clearAllMocks(); setMailTransportFactory(async () => transport); });
  afterEach(() => { setMailTransportFactory(null); });

  it('returns not-configured and sends nothing when the host is missing', async () => {
    const result = await sendMail({ to: 'a@b.com', subject: 's', text: 't' }, { ...full, host: '' });
    expect(result).toMatchObject({ ok: false, reason: 'not-configured' });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('sends with the configured From and returns the message id', async () => {
    const result = await sendMail({ to: 'a@b.com', subject: 'Hello', text: 'plain', html: '<p>plain</p>' }, full);
    expect(result).toEqual({ ok: true, messageId: '<id-1>' });
    expect(sent[0]).toEqual({ from: 'Shop <no-reply@example.com>', to: 'a@b.com', subject: 'Hello', text: 'plain', html: '<p>plain</p>' });
  });

  it('never throws: transport errors come back as send-failed', async () => {
    setMailTransportFactory(async () => ({ ...transport, sendMail: async () => { throw new Error('535 Authentication failed'); } }));
    const result = await sendMail({ to: 'a@b.com', subject: 's', text: 't' }, full);
    expect(result).toEqual({ ok: false, reason: 'send-failed', error: '535 Authentication failed' });
  });

  it('verifyMailConfig reports connection problems without throwing', async () => {
    expect(await verifyMailConfig(full)).toEqual({ ok: true });
    setMailTransportFactory(async () => ({ ...transport, verify: async () => { throw new Error('ECONNREFUSED'); } }));
    expect(await verifyMailConfig(full)).toEqual({ ok: false, error: 'ECONNREFUSED' });
    expect(await verifyMailConfig({ ...full, from: '' })).toMatchObject({ ok: false });
  });
});

describe('templates', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  });

  it('temp password email carries the credentials in text and html, escaped', () => {
    const mail = tempPasswordEmail({ name: 'สมชาย <b>', email: 'shop@example.com', tempPassword: 'Ab<9>xyz', loginUrl: 'https://12buy.example/login', brand: '12buy Dealer', shop: 'ร้านยางดี' });
    expect(mail.subject).toContain('12buy Dealer');
    expect(mail.text).toContain('รหัสผ่านชั่วคราว: Ab<9>xyz');
    expect(mail.text).toContain('https://12buy.example/login');
    expect(mail.text).toContain('ร้านยางดี');
    expect(mail.html).toContain('Ab&lt;9&gt;xyz');
    expect(mail.html).toContain('สมชาย &lt;b&gt;');
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).toContain('href="https://12buy.example/login"');
  });

  it('test email names the sender', () => {
    const mail = testEmail({ brand: 'X', sentBy: 'Admin' });
    expect(mail.subject).toContain('X');
    expect(mail.text).toContain('Admin');
  });
});
