/**
 * Odoo JSON-RPC client for the dealer shop.
 *
 * Reads: only methods listed in `READ_METHODS` go through `odooRead`.
 * Writes: only the model/method pairs in `WRITE_METHODS` go through `odooWrite`,
 * and only when `ODOO_READ_ONLY=false` is set explicitly. Anything else throws
 * before a network request is made.
 */

const READ_METHODS = new Set([
  'search_read',
  'read',
  'search',
  'search_count',
  'fields_get',
  'name_search',
  'read_group',
]);

/**
 * The only writes the web may send: link dealers as partners, push confirmed orders
 * (with a coupon code through Odoo's coupon wizard), and publish approved price books
 * as pricelists.
 */
const WRITE_METHODS: Record<string, ReadonlySet<string>> = {
  'res.partner': new Set(['create']),
  'sale.order': new Set(['create', 'action_confirm']),
  'sale.loyalty.coupon.wizard': new Set(['create', 'action_apply']),
  'product.pricelist': new Set(['create']),
  'product.pricelist.item': new Set(['create', 'write', 'unlink']),
};

type RpcConfig = { url: string; db: string; username: string; apiKey: string };

let requestId = 0;
let cachedUid: number | null = null;

/** Loads Odoo connection settings from environment variables. */
function getConfig(): RpcConfig {
  const config = {
    url: process.env.ODOO_URL ?? '',
    db: process.env.ODOO_DB ?? '',
    username: process.env.ODOO_USERNAME ?? '',
    apiKey: process.env.ODOO_API_KEY ?? '',
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing Odoo config: ${missing.join(', ')}`);
  return config;
}

const MAX_ATTEMPTS = 4;
let queue: Promise<unknown> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends one JSON-RPC request to Odoo and unwraps the result or error.
 * Requests are serialized through a single queue and retried with backoff on
 * HTTP 429, because Odoo Online rate-limits bursts of parallel calls.
 */
function jsonRpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
  const run = async (): Promise<T> => {
    const { url } = getConfig();
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(`${url}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method: 'call', params: { service, method, args } }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Odoo HTTP ${response.status}`);
      return unwrap<T>(await response.json());
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Extracts the result from a JSON-RPC envelope or throws its error. */
function unwrap<T>(payload: { result?: T; error?: { message?: string; data?: { message?: string } } }): T {
  if (payload.error) throw new Error(payload.error.data?.message ?? payload.error.message ?? 'Odoo RPC error');
  return payload.result as T;
}

/** Authenticates once and caches the user id for the process lifetime. */
async function authenticate(): Promise<number> {
  if (cachedUid) return cachedUid;
  const { db, username, apiKey } = getConfig();
  const uid = await jsonRpc<number | false>('common', 'authenticate', [db, username, apiKey, {}]);
  if (!uid) throw new Error('Odoo authentication failed');
  cachedUid = uid;
  return uid;
}

/**
 * Checks a person's own Odoo login (e.g. a portal user) and returns their uid, or null when the
 * login or password is wrong. Never cached; runs with their credentials only for this check.
 */
export async function odooCheckLogin(login: string, password: string): Promise<number | null> {
  const { db } = getConfig();
  const uid = await jsonRpc<number | false>('common', 'authenticate', [db, login, password, {}]);
  return uid || null;
}

/**
 * Calls a read-only method on an Odoo model via `execute_kw`.
 * Throws synchronously-equivalent error for any non-read method so the
 * prototype can never modify Odoo data.
 */
export async function odooRead<T>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> {
  if (!READ_METHODS.has(method)) {
    throw new Error(`Blocked: '${model}.${method}' is not a read-only method`);
  }
  const { db, apiKey } = getConfig();
  const uid = await authenticate();
  return jsonRpc<T>('object', 'execute_kw', [db, uid, apiKey, model, method, args, kwargs]);
}

/** Convenience wrapper around `search_read`. */
export function odooSearchRead<T>(model: string, domain: unknown[], fields: string[], extra: Record<string, unknown> = {}) {
  return odooRead<T[]>(model, 'search_read', [domain], { fields, ...extra });
}

/** True when writes to Odoo are switched on (`ODOO_READ_ONLY=false`). */
export function odooWritesEnabled(): boolean {
  return process.env.ODOO_READ_ONLY === 'false';
}

/**
 * Calls one of the allow-listed write methods in `WRITE_METHODS`.
 * Throws without touching the network when writes are off or the pair is not allowed.
 */
export async function odooWrite<T>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> {
  if (!WRITE_METHODS[model]?.has(method)) throw new Error(`Blocked: '${model}.${method}' is not an allowed write`);
  if (!odooWritesEnabled()) throw new Error('Odoo อยู่ในโหมดอ่านอย่างเดียว (ตั้ง ODOO_READ_ONLY=false เพื่อเปิดการส่งข้อมูล)');
  const { db, apiKey } = getConfig();
  const uid = await authenticate();
  return jsonRpc<T>('object', 'execute_kw', [db, uid, apiKey, model, method, args, kwargs]);
}
