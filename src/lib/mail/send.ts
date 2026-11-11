/**
 * Thin SMTP sender over nodemailer. `sendMail` never throws: a missing config or a transport error
 * comes back as `{ ok: false, error }` so callers (password reset, notifications) can fall back to
 * showing the information to staff instead of failing the whole action.
 */
import { logger } from '@/lib/logger';
import { getMailConfig, mailConfigured, type MailConfig } from './config';

const log = logger('mail');
const TIMEOUT_MS = 15_000;

export type MailMessage = { to: string; subject: string; text: string; html?: string };
export type MailResult = { ok: true; messageId: string | null } | { ok: false; error: string; reason: 'not-configured' | 'send-failed' };

/** Minimal shape of the nodemailer transport we rely on (kept narrow so tests can stub it). */
export type MailTransport = { sendMail(message: { from: string; to: string; subject: string; text: string; html?: string }): Promise<{ messageId?: string }>; verify(): Promise<unknown> };

type TransportFactory = (config: MailConfig) => Promise<MailTransport>;

/** Creates a nodemailer SMTP transport (imported lazily so the dependency only loads on the server when needed). */
const defaultFactory: TransportFactory = async (config) => {
  const nodemailer = await import('nodemailer');
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  }) as unknown as MailTransport;
};

let factory: TransportFactory = defaultFactory;

/** Test helper: swap the transport factory (pass `null` to restore nodemailer). */
export function setMailTransportFactory(next: TransportFactory | null): void {
  factory = next ?? defaultFactory;
}

/** True when an SMTP host and sender are set (env or /admin/settings). */
export async function mailEnabled(): Promise<boolean> {
  return mailConfigured(await getMailConfig());
}

/** Sends one email with the config in use. Never throws. */
export async function sendMail(message: MailMessage, override?: MailConfig): Promise<MailResult> {
  const config = override ?? await getMailConfig();
  if (!mailConfigured(config)) {
    log.info('skipped: SMTP not configured', { to: message.to, subject: message.subject });
    return { ok: false, reason: 'not-configured', error: 'ยังไม่ได้ตั้งค่าอีเมลขาออก (SMTP)' };
  }
  try {
    const transport = await factory(config);
    const info = await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    log.info('sent', { to: message.to, subject: message.subject, messageId: info.messageId ?? null });
    return { ok: true, messageId: info.messageId ?? null };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    log.error('send failed', { to: message.to, subject: message.subject, error });
    return { ok: false, reason: 'send-failed', error: text };
  }
}

/** Opens a connection and authenticates without sending (used by the settings "test" button). Never throws. */
export async function verifyMailConfig(config: MailConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mailConfigured(config)) return { ok: false, error: 'กรอก SMTP host และผู้ส่ง (From) ก่อน' };
  try {
    const transport = await factory(config);
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
