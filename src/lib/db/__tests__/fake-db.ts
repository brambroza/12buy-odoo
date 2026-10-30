/**
 * Minimal in-memory stand-in for the supabase-js query builder, covering only what the
 * shop/admin stores use: select/insert/upsert/update with eq/lt/order, maybeSingle/single,
 * a `place_shop_order` RPC that mirrors the SQL function, and a storage bucket.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

const KEYS: Record<string, string> = { ShopCart: 'scope', ShopOrder: 'id', AdminState: 'id' };
const clone = <T>(value: T): T => structuredClone(value);
const nowSql = () => new Date().toISOString().replace('Z', '');

export function createFakeDb() {
  const tables = new Map<string, Row[]>();
  const files = new Map<string, Uint8Array>();
  let seq = 0;
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };

  class Query implements PromiseLike<Result> {
    private filters: Filter[] = [];
    private sort: { col: string; asc: boolean } | null = null;
    private mode: 'many' | 'maybe' | 'single' = 'many';
    private op: 'select' | 'update' | 'upsert' | 'insert' = 'select';
    private payload: Row | null = null;
    private head = false;
    private countRows = false;
    private returnRows = false;
    constructor(private readonly name: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (this.op !== 'select') this.returnRows = true;
      this.head = Boolean(opts?.head);
      this.countRows = Boolean(opts?.count);
      return this;
    }
    insert(row: Row) { this.op = 'insert'; this.payload = row; return this; }
    upsert(row: Row) { this.op = 'upsert'; this.payload = row; return this; }
    update(row: Row) { this.op = 'update'; this.payload = row; return this; }
    eq(col: string, value: unknown) { this.filters.push((r) => r[col] === value); return this; }
    lt(col: string, value: string) { this.filters.push((r) => String(r[col]) < value.replace('Z', '')); return this; }
    /** `not(col, 'in', '("A","B")')` as the store uses it, and `not(col, 'is', null)` as the notifier does. */
    not(col: string, op: 'in' | 'is', value: string | null) {
      if (op === 'is') {
        this.filters.push((r) => r[col] !== null && r[col] !== undefined);
        return this;
      }
      const values = [...String(value ?? '').matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
      this.filters.push((r) => !values.includes(String(r[col])));
      return this;
    }
    /** `or('a.eq."x",b.like."y%"')` with quoted values (see `quoteFilterValue`); supports eq and like. */
    or(expr: string) {
      const terms = [...expr.matchAll(/(\w+)\.(eq|like)\."((?:[^"\\]|\\.)*)"/g)].map(([, col, op, raw]) => {
        const value = raw.replace(/\\(.)/g, '$1');
        if (op === 'eq') return (r: Row) => String(r[col]) === value;
        const re = new RegExp(`^${value.split('%').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
        return (r: Row) => re.test(String(r[col]));
      });
      this.filters.push((r) => terms.some((t) => t(r)));
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) { this.sort = { col, asc: opts?.ascending ?? true }; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    single() { this.mode = 'single'; return this; }

    private run(): Result {
      const rows = table(this.name);
      const key = KEYS[this.name];
      const match = () => rows.filter((r) => this.filters.every((f) => f(r)));
      let out: Row[];
      if (this.op === 'insert') {
        rows.push(clone(this.payload!));
        out = [this.payload!];
      } else if (this.op === 'upsert') {
        const existing = rows.find((r) => r[key] === this.payload![key]);
        if (existing) Object.assign(existing, clone(this.payload!));
        else rows.push({ items: [], couponCode: null, ...clone(this.payload!) });
        out = [existing ?? rows.at(-1)!];
      } else if (this.op === 'update') {
        out = match();
        for (const r of out) Object.assign(r, clone(this.payload!));
        if (!this.returnRows) return { data: null, error: null };
      } else {
        out = match();
        if (this.sort) {
          const { col, asc } = this.sort;
          out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
        }
        if (this.head) return { data: null, error: null, count: out.length };
      }
      const data = clone(out);
      if (this.mode === 'many') return { data, error: null, count: this.countRows ? data.length : null };
      if (this.mode === 'single' && data.length !== 1) return { data: null, error: { message: 'not single', code: 'PGRST116' } };
      return { data: data[0] ?? null, error: null };
    }

    then<T1 = Result, T2 = never>(ok?: ((value: Result) => T1 | PromiseLike<T1>) | null, fail?: ((reason: unknown) => T2 | PromiseLike<T2>) | null) {
      return Promise.resolve().then(() => this.run()).then(ok, fail);
    }
  }

  const rpc = async (fn: string, args: Record<string, unknown>): Promise<Result> => {
    if (fn !== 'place_shop_order') return { data: null, error: { message: `unknown rpc ${fn}` } };
    const order = args.p_order as Row;
    const cart = table('ShopCart').find((c) => c.scope === order.scope);
    if (!cart || !(cart.items as unknown[]).length) return { data: null, error: { message: 'CART_EMPTY', code: 'P0001' } };
    seq += 1;
    const now = nowSql();
    const row: Row = {
      ...order, poRef: order.poRef || null, note: order.note ?? '', coupon: order.coupon ?? null, odooPricelistId: order.odooPricelistId ?? null,
      ref: `WEB-${now.slice(0, 10).replace(/-/g, '')}-${String(seq).padStart(3, '0')}`, status: 'PENDING', trackingRef: null, odoo: null,
      payment: { slipFile: null, slipUploadedAt: null, verifiedAt: null }, events: [{ status: 'PENDING', at: `${now}Z` }], createdAt: now, updatedAt: now,
    };
    table('ShopOrder').push(row);
    Object.assign(cart, { items: [], couponCode: null });
    return { data: clone(row), error: null };
  };

  const storage = {
    from: (_bucket: string) => ({
      upload: async (name: string, body: Uint8Array) => { files.set(name, body); return { data: { path: name }, error: null }; },
      download: async (name: string) => (files.has(name) ? { data: new Blob([files.get(name)! as BlobPart]), error: null } : { data: null, error: { message: 'not found' } }),
      remove: async (names: string[]) => { for (const n of names) files.delete(n); return { data: null, error: null }; },
    }),
  };

  return { client: { from: (name: string) => new Query(name), rpc, storage }, tables, files };
}
