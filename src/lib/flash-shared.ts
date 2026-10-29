// Pure flash-message codec shared by server actions (write) and the client listener (read).

/** Cookie that carries one toast from a server action to the browser. Readable by JS; holds no secrets. */
export const FLASH_COOKIE = 'flash';

export type FlashType = 'success' | 'info' | 'warning' | 'error';

/** Icon shown in the toast, picked per action so each button's toast reads at a glance. */
export type FlashIcon =
  | 'check' | 'save' | 'create' | 'delete' | 'cart' | 'cartRemove' | 'coupon' | 'order' | 'cancel' | 'truck' | 'upload'
  | 'user' | 'userOff' | 'key' | 'login' | 'logout' | 'eye' | 'send' | 'publish' | 'reject' | 'sync' | 'import'
  | 'price' | 'map' | 'group' | 'store' | 'image' | 'mail';

export type Flash = { id: string; type: FlashType; title: string; description?: string; icon?: FlashIcon };

const TYPES: FlashType[] = ['success', 'info', 'warning', 'error'];

/** Serializes a flash for the cookie (base64url JSON, so Thai text and commas are cookie-safe). */
export function encodeFlash(flash: Flash): string {
  const bytes = new TextEncoder().encode(JSON.stringify(flash));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Parses a cookie value back into a flash; null when it is missing or malformed. Fields are length-capped. */
export function decodeFlash(value: string | undefined | null): Flash | null {
  if (!value) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as Partial<Flash>;
    if (typeof data.title !== 'string' || !data.title || typeof data.id !== 'string') return null;
    return {
      id: data.id.slice(0, 40),
      type: TYPES.includes(data.type as FlashType) ? (data.type as FlashType) : 'success',
      title: data.title.slice(0, 160),
      description: typeof data.description === 'string' && data.description ? data.description.slice(0, 300) : undefined,
      icon: typeof data.icon === 'string' ? (data.icon as FlashIcon) : undefined,
    };
  } catch {
    return null;
  }
}
