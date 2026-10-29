import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { encodeFlash, FLASH_COOKIE, type FlashIcon, type FlashType } from './flash-shared';

/**
 * Queues a toast for the browser from a server action. Call it before `redirect()` / at the end of the action;
 * `FlashListener` picks the cookie up on the next render or within a moment, shows it top-right and clears it.
 */
export async function flash(title: string, options: { type?: FlashType; description?: string; icon?: FlashIcon } = {}): Promise<void> {
  const jar = await cookies();
  jar.set(FLASH_COOKIE, encodeFlash({ id: randomUUID(), type: options.type ?? 'success', title, description: options.description, icon: options.icon }), {
    path: '/', maxAge: 30, sameSite: 'lax', httpOnly: false, secure: process.env.NODE_ENV === 'production',
  });
}
