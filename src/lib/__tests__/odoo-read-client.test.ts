import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOdooReadClient } from '@/lib/odoo/rpc';

/** Fake Odoo answering `authenticate` with a uid per database and echoing `execute_kw` arguments. */
function fakeOdoo() {
  return vi.fn(async (url: string, init: { body: string }) => {
    const { params } = JSON.parse(init.body) as { params: { service: string; method: string; args: unknown[] } };
    const result: unknown = params.method === 'authenticate' ? (params.args[0] === 'db-a' ? 11 : 22) : { url, args: params.args };
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ result }) };
  });
}

describe('createOdooReadClient', () => {
  const fetchSpy = fakeOdoo();
  beforeEach(() => vi.stubGlobal('fetch', fetchSpy));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockClear();
  });

  it('keeps each company on its own URL, database and uid', async () => {
    const a = createOdooReadClient({ url: 'https://a.odoo.test/', db: 'db-a', username: 'ua', apiKey: 'ka' });
    const b = createOdooReadClient({ url: 'https://b.odoo.test', db: 'db-b', username: 'ub', apiKey: 'kb' });
    const [ra, rb] = await Promise.all([a.searchRead('res.users', [], ['id']), b.read('res.users', 'search_count', [[]])]) as unknown as [{ url: string; args: unknown[] }, { url: string; args: unknown[] }];
    expect(ra.url).toBe('https://a.odoo.test/jsonrpc');
    expect(ra.args.slice(0, 5)).toEqual(['db-a', 11, 'ka', 'res.users', 'search_read']);
    expect(rb.url).toBe('https://b.odoo.test/jsonrpc');
    expect(rb.args.slice(0, 3)).toEqual(['db-b', 22, 'kb']);
    await a.read('res.users', 'read', [[1]]);
    // One authenticate per client, then cached.
    const auths = fetchSpy.mock.calls.filter(([, init]) => (init as { body: string }).body.includes('"authenticate"'));
    expect(auths).toHaveLength(2);
  });

  it('blocks write methods before any network call', async () => {
    const c = createOdooReadClient({ url: 'https://a.odoo.test', db: 'db-a', username: 'u', apiKey: 'k' });
    await expect(c.read('res.partner', 'write', [[1], {}])).rejects.toThrow('not a read-only method');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails clearly when Odoo refuses the login', async () => {
    fetchSpy.mockImplementationOnce(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ result: false }) }));
    const c = createOdooReadClient({ url: 'https://a.odoo.test', db: 'db-a', username: 'u', apiKey: 'bad' });
    await expect(c.searchRead('res.users', [], ['id'])).rejects.toThrow('authentication failed');
  });
});
