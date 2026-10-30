/**
 * LINE Messaging API: push a text or Flex message to a user or group. Errors are returned, not thrown,
 * so a LINE outage never blocks the order flow that triggered the message.
 */
import { logger } from '@/lib/logger';
import { getLineConfig } from './line-config';

const API = 'https://api.line.me/v2/bot/message/push';
const log = logger('line');

export type LineMessage = { type: 'text'; text: string } | { type: 'flex'; altText: string; contents: Record<string, unknown> };
export type LinePushResult = { ok: true } | { ok: false; error: string };

/** Pushes up to 5 messages to one LINE user / group id. */
export async function linePush(to: string, messages: LineMessage[], token?: string): Promise<LinePushResult> {
  const accessToken = token ?? (await getLineConfig()).channelAccessToken;
  if (!accessToken) return { ok: false, error: 'ยังไม่ได้ตั้ง LINE channel access token' };
  if (!to) return { ok: false, error: 'ไม่มีปลายทาง' };
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { message?: string; details?: { message?: string }[] };
    const error = `LINE ${res.status}: ${body.message ?? ''}${body.details?.[0]?.message ? ` (${body.details[0].message})` : ''}`.trim();
    log.warn('push rejected', { to: to.slice(0, 6), status: res.status, error });
    return { ok: false, error };
  } catch (error) {
    log.error('push failed', { error });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Flex "card": red header with the title, body text, optional key/value rows and a button that opens
 * the web page. Renders well on phones and falls back to `altText` in notifications.
 */
export function flexCard(input: { title: string; body: string; rows?: { label: string; value: string }[]; button?: { label: string; url: string }; accent?: string }): LineMessage {
  const accent = input.accent ?? '#d9342b';
  const rows = (input.rows ?? []).map((r) => ({
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: r.label, size: 'sm', color: '#8c8c8c', flex: 2 },
      { type: 'text', text: r.value || '-', size: 'sm', color: '#222222', flex: 4, wrap: true },
    ],
  }));
  return {
    type: 'flex',
    altText: `${input.title} · ${input.body}`.slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: accent, paddingAll: '12px', contents: [{ type: 'text', text: input.title, weight: 'bold', color: '#ffffff', size: 'md', wrap: true }] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '14px', contents: [{ type: 'text', text: input.body, size: 'sm', color: '#333333', wrap: true }, ...(rows.length ? [{ type: 'separator' }, { type: 'box', layout: 'vertical', spacing: 'sm', contents: rows }] : [])] },
      ...(input.button ? { footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: accent, height: 'sm', action: { type: 'uri', label: input.button.label, uri: input.button.url } }] } } : {}),
    },
  };
}
