import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: 'select' | 'insert' | 'update' | 'delete'; payload?: unknown; filters: [string, unknown][] };

const db = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  audit: vi.fn(),
  calls: [] as Call[],
  /** Result for each awaited query, chosen by the test. */
  respond: vi.fn(),
}));

/** Minimal chainable stand-in for the supabase-js query builder. */
function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const q = {
    select: () => q,
    insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return q; },
    update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return q; },
    eq: (col: string, val: unknown) => { call.filters.push([col, val]); return q; },
    limit: () => q,
    order: () => q,
    single: () => q,
    maybeSingle: () => q,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      db.calls.push(call);
      return Promise.resolve(db.respond(call) ?? { data: null, error: null }).then(resolve, reject);
    },
  };
  return q;
}

vi.mock('@/lib/db/client', () => ({ db: () => ({ from: builder }) }));
vi.mock('@/lib/auth/users', () => ({ findUserByEmail: db.findUserByEmail }));
vi.mock('@/lib/auth/audit', () => ({ audit: db.audit }));

const op = (kind: Call['op']) => db.calls.filter((c) => c.op === kind);
/** Pending lookup returns `existing`; insert returns `{ id: 'r1' }`. */
const respondWith = (existing: unknown) => db.respond.mockImplementation((c: Call) => {
  if (c.op === 'select') return { data: existing, error: null };
  if (c.op === 'insert') return { data: { id: 'r1' }, error: null };
  return { data: [], error: null };
});

import { RESET_RATE_LIMIT, allowResetRequest, requestPasswordReset, resetResetRateLimit, resolveResetRequests } from '@/lib/auth/reset-requests';

const activeUser = { id: 'u1', email: 'shop@example.com', name: 'ร้านทดสอบ', isActive: true, dealer: { name: 'ร้าน A' } };

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  resetResetRateLimit();
  delete process.env.LEAD_WEBHOOK_URL;
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('allowResetRequest', () => {
  it('allows up to the limit per key, then blocks', () => {
    for (let i = 0; i < RESET_RATE_LIMIT.max; i++) expect(allowResetRequest('1.1.1.1', 1000)).toBe(true);
    expect(allowResetRequest('1.1.1.1', 1000)).toBe(false);
    expect(allowResetRequest('2.2.2.2', 1000)).toBe(true);
  });

  it('frees the slot once the window passes', () => {
    for (let i = 0; i < RESET_RATE_LIMIT.max; i++) allowResetRequest('ip', 0);
    expect(allowResetRequest('ip', RESET_RATE_LIMIT.windowMs + 1)).toBe(true);
  });
});

describe('requestPasswordReset', () => {
  it('ignores unknown emails without creating a request', async () => {
    db.findUserByEmail.mockResolvedValue(null);
    await requestPasswordReset({ email: 'nobody@example.com', contact: null, ip: null });
    expect(op('insert')).toHaveLength(0);
    expect(db.audit).toHaveBeenCalledWith(null, 'password-reset.request-ignored', 'User', 'nobody@example.com');
  });

  it('ignores inactive users', async () => {
    db.findUserByEmail.mockResolvedValue({ ...activeUser, isActive: false });
    await requestPasswordReset({ email: activeUser.email, contact: null, ip: null });
    expect(op('insert')).toHaveLength(0);
  });

  it('creates one pending request for an active user', async () => {
    db.findUserByEmail.mockResolvedValue(activeUser);
    respondWith(null);
    await requestPasswordReset({ email: activeUser.email, contact: '@shopline', ip: '1.1.1.1' });
    expect(op('insert')).toHaveLength(1);
    expect(op('insert')[0].payload).toMatchObject({ userId: 'u1', contact: '@shopline', ip: '1.1.1.1' });
    expect(db.audit).toHaveBeenCalledWith('u1', 'password-reset.request', 'PasswordResetRequest', 'r1');
  });

  it('does not duplicate a pending request, only refreshes the contact', async () => {
    db.findUserByEmail.mockResolvedValue(activeUser);
    respondWith({ id: 'r1', contact: null, status: 'PENDING', createdAt: '2026-10-28T00:00:00' });
    await requestPasswordReset({ email: activeUser.email, contact: '0812345678', ip: null });
    expect(op('insert')).toHaveLength(0);
    expect(op('update')).toEqual([{ table: 'PasswordResetRequest', op: 'update', payload: { contact: '0812345678' }, filters: [['id', 'r1']] }]);
  });

  it('posts to the webhook when configured, without leaking the IP', async () => {
    process.env.LEAD_WEBHOOK_URL = 'https://hooks.example.com/x';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    db.findUserByEmail.mockResolvedValue(activeUser);
    respondWith(null);
    await requestPasswordReset({ email: activeUser.email, contact: null, ip: '9.9.9.9' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ type: 'password_reset_request', id: 'r1', email: activeUser.email, shop: 'ร้าน A' });
    expect(JSON.stringify(body)).not.toContain('9.9.9.9');
    fetchMock.mockRestore();
  });

  it('swallows webhook failures', async () => {
    process.env.LEAD_WEBHOOK_URL = 'https://hooks.example.com/x';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.findUserByEmail.mockResolvedValue(activeUser);
    respondWith(null);
    await expect(requestPasswordReset({ email: activeUser.email, contact: null, ip: null })).resolves.toBeUndefined();
    fetchMock.mockRestore();
    errorLog.mockRestore();
  });
});

describe('resolveResetRequests', () => {
  it('closes every pending request of the user', async () => {
    db.respond.mockReturnValue({ data: [{ id: 'r1' }, { id: 'r2' }], error: null });
    await expect(resolveResetRequests('u1', 'admin1')).resolves.toBe(2);
    const [update] = op('update');
    expect(update.payload).toMatchObject({ status: 'DONE', resolvedById: 'admin1' });
    expect(update.filters).toEqual([['userId', 'u1'], ['status', 'PENDING']]);
  });
});
