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
 * The only writes the web may send: link dealers as partners, set a customer's pricelist,
 * credit limit and delivery method, push confirmed orders (with a coupon code through Odoo's coupon wizard)
 * and make their draft invoice through Odoo's "Create invoice" wizard, publish
 * approved price books as pricelists, create / archive discount-code and coupon programs,
 * add / rename / publish / archive delivery methods, and post internal chatter notes (with the
 * dealer's slip attached) on sale orders and invoices when a credit payment is reported / checked.
 */
const WRITE_METHODS: Record<string, ReadonlySet<string>> = {
  'res.partner': new Set(['create', 'write']),
  // `action_cancel`: admin cancels a web order whose SO already exists (web and Odoo stay in step).
  'sale.order': new Set(['create', 'action_confirm', 'action_cancel', 'message_post']),
  'sale.loyalty.coupon.wizard': new Set(['create', 'action_apply']),
  'sale.advance.payment.inv': new Set(['create', 'create_invoices']),
  'product.pricelist': new Set(['create']),
  'product.pricelist.item': new Set(['create', 'write', 'unlink']),
  'loyalty.program': new Set(['create', 'write']),
  'loyalty.card': new Set(['create']),
  'delivery.carrier': new Set(['create', 'write']),
  // Chatter notes for dealer credit payments: slip as an attachment, internal note on the SO and its invoice.
  'ir.attachment': new Set(['create']),
  // `button_cancel`: the draft invoice of a cancelled web order.
  'account.move': new Set(['message_post', 'button_cancel']),
};

/** Keyword arguments allowed per `model.method` (others are refused before any request). */
const WRITE_KWARGS: Record<string, ReadonlySet<string>> = {
  'sale.order.message_post': new Set(['body', 'body_is_html', 'message_type', 'subtype_xmlid', 'attachment_ids']),
  'account.move.message_post': new Set(['body', 'body_is_html', 'message_type', 'subtype_xmlid', 'attachment_ids']),
};

/** Writes limited to these fields (`model.method` → fields allowed in the values dict, `args[1]`). */
const WRITE_FIELDS: Record<string, ReadonlySet<string>> = {
  'res.partner.write': new Set(['property_product_pricelist', 'credit_limit', 'use_partner_credit_limit', 'property_delivery_carrier_id']),
  'delivery.carrier.write': new Set(['name', 'sequence', 'is_published', 'active']),
  // File content: `datas` (≤ Odoo 18) or `raw` (Odoo 19+), base64 over RPC either way.
  'ir.attachment.create': new Set(['name', 'mimetype', 'datas', 'raw', 'res_model', 'res_id']),
};

import { getOdooConnection, invalidateOdooConnection } from './connection';
import { logger } from '@/lib/logger';

const log = logger('odoo');
/** Calls slower than this are logged at warn level even when debug logging is off. */
const SLOW_MS = 3000;

type RpcConfig = { url: string; db: string; username: string; apiKey: string };

let requestId = 0;
let cachedUid: number | null = null;

/** Odoo connection in use: saved back-office settings when present, else the `ODOO_*` env vars. */
async function getConfig(): Promise<RpcConfig> {
  const { url, db, username, apiKey } = await getOdooConnection();
  const config = { url, db, username, apiKey };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing Odoo config: ${missing.join(', ')}`);
  return config;
}

/** Base URL of the Odoo in use (for links to records / product images), or '' when not configured. */
export async function odooBaseUrl(): Promise<string> {
  return (await getOdooConnection()).url;
}

/** Forgets the authenticated uid and the cached connection, so the next call uses the newest settings. */
export function resetOdooSession(): void {
  cachedUid = null;
  invalidateOdooConnection();
}

/** Round trip to Odoo (`common.version`) for health checks; resolves with the latency in ms. */
export async function odooPing(): Promise<number> {
  const started = Date.now();
  await jsonRpc('common', 'version', []);
  return Date.now() - started;
}

/** Uid of the configured Odoo user (authenticates once per process). */
export async function odooUid(): Promise<number> {
  return authenticate();
}

/**
 * Tries a connection without touching the cached one: authenticates with the given credentials and
 * reads the server version. Throws with Odoo's message when the URL, database, login or key is wrong.
 */
export async function probeOdooConnection(conn: RpcConfig): Promise<{ uid: number; serverVersion: string }> {
  const url = conn.url.replace(/\/+$/, '');
  const version = await jsonRpcTo<{ server_version?: string }>(url, 'common', 'version', []);
  const uid = await jsonRpcTo<number | false>(url, 'common', 'authenticate', [conn.db, conn.username, conn.apiKey, {}]);
  if (!uid) throw new Error('Odoo ไม่ยอมรับชื่อผู้ใช้หรือ API key นี้ (หรือชื่อฐานข้อมูลไม่ถูกต้อง)');
  return { uid, serverVersion: version?.server_version ?? '?' };
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
    // Never log `args`: for `execute_kw` they carry the API key. Model + method are enough to trace.
    const label = service === 'object' ? `${String(args[3])}.${String(args[4])}` : `${service}.${method}`;
    const started = Date.now();
    try {
      const value = await jsonRpcTo<T>((await getConfig()).url, service, method, args);
      const ms = Date.now() - started;
      if (ms >= SLOW_MS) log.warn('slow call', { call: label, ms });
      else log.debug('call', { call: label, ms });
      return value;
    } catch (error) {
      log.error('call failed', { call: label, ms: Date.now() - started, error });
      throw error;
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** One JSON-RPC call to a given Odoo base URL, with the 429 backoff; used by the queue and by connection probes. */
async function jsonRpcTo<T>(url: string, service: string, method: string, args: unknown[]): Promise<T> {
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
}

/** Extracts the result from a JSON-RPC envelope or throws its error. */
function unwrap<T>(payload: { result?: T; error?: { message?: string; data?: { message?: string } } }): T {
  if (payload.error) throw new Error(payload.error.data?.message ?? payload.error.message ?? 'Odoo RPC error');
  return payload.result as T;
}

/** Authenticates once and caches the user id for the process lifetime. */
async function authenticate(): Promise<number> {
  if (cachedUid) return cachedUid;
  const { db, username, apiKey } = await getConfig();
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
  const { db } = await getConfig();
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
  const { db, apiKey } = await getConfig();
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
  const allowedFields = WRITE_FIELDS[`${model}.${method}`];
  if (allowedFields) {
    // `write(ids, values)` carries the values second; `create(values | [values])` first.
    const raw = method === 'create' ? args[0] : args[1];
    const dicts = (Array.isArray(raw) ? raw : [raw]).filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object');
    const fields = dicts.flatMap((v) => Object.keys(v));
    const blocked = fields.filter((f) => !allowedFields.has(f));
    if (!fields.length || blocked.length) throw new Error(`Blocked: '${model}.${method}' may not write ${blocked.join(', ') || 'these values'}`);
  }
  const allowedKwargs = WRITE_KWARGS[`${model}.${method}`];
  if (allowedKwargs) {
    const blocked = Object.keys(kwargs).filter((k) => !allowedKwargs.has(k));
    if (blocked.length) throw new Error(`Blocked: '${model}.${method}' may not pass ${blocked.join(', ')}`);
  }
  if (!odooWritesEnabled()) throw new Error('Odoo อยู่ในโหมดอ่านอย่างเดียว (ตั้ง ODOO_READ_ONLY=false เพื่อเปิดการส่งข้อมูล)');
  const { db, apiKey } = await getConfig();
  const uid = await authenticate();
  return jsonRpc<T>('object', 'execute_kw', [db, uid, apiKey, model, method, args, kwargs]);
}
