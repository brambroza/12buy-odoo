/**
 * LINE Login (OAuth 2.1 / OIDC) used only to learn the dealer's LINE user id, so pushes can reach them.
 * No LINE sign-in to the web: the user is already signed in when they press "เชื่อม LINE".
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { absoluteUrl } from '@/lib/seo';
import { getLineConfig } from './line-config';

export const LINE_STATE_COOKIE = 'line_link_state';
const AUTHORIZE = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN = 'https://api.line.me/oauth2/v2.1/token';
const PROFILE = 'https://api.line.me/v2/profile';

export function lineCallbackUrl(): string {
  return absoluteUrl('/api/auth/line/callback');
}

/** Random state bound to the user id with an HMAC (so a stolen callback cannot link someone else's LINE). */
export function makeState(userId: string, secret: string): string {
  const nonce = randomBytes(16).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${userId}.${nonce}`).digest('base64url');
  return `${nonce}.${sig}`;
}

export function verifyState(state: string, userId: string, secret: string): boolean {
  const [nonce, sig] = state.split('.');
  if (!nonce || !sig) return false;
  const expected = createHmac('sha256', secret).update(`${userId}.${nonce}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Authorize URL; `bot_prompt=aggressive` offers "add the OA as a friend" in the same screen. */
export async function lineAuthorizeUrl(state: string): Promise<string | null> {
  const { loginChannelId } = await getLineConfig();
  if (!loginChannelId) return null;
  const params = new URLSearchParams({ response_type: 'code', client_id: loginChannelId, redirect_uri: lineCallbackUrl(), state, scope: 'profile openid', bot_prompt: 'aggressive' });
  return `${AUTHORIZE}?${params.toString()}`;
}

export type LineProfile = { userId: string; displayName: string; pictureUrl?: string };

/** Exchanges the code and reads the profile. Throws with a short reason on any failure. */
export async function exchangeCode(code: string): Promise<LineProfile> {
  const { loginChannelId, loginChannelSecret } = await getLineConfig();
  if (!loginChannelId || !loginChannelSecret) throw new Error('ยังไม่ได้ตั้งค่า LINE Login channel');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: lineCallbackUrl(), client_id: loginChannelId, client_secret: loginChannelSecret });
  const tokenRes = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(8000) });
  if (!tokenRes.ok) throw new Error(`LINE token ${tokenRes.status}`);
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error('LINE ไม่คืน access token');
  const profileRes = await fetch(PROFILE, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(8000) });
  if (!profileRes.ok) throw new Error(`LINE profile ${profileRes.status}`);
  const profile = (await profileRes.json()) as LineProfile;
  if (!profile.userId) throw new Error('LINE ไม่คืน user id');
  return profile;
}
