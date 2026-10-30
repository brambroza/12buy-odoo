import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({ getSetting: vi.fn(), putSetting: vi.fn(), deleteSetting: vi.fn() }));
vi.mock('@/lib/settings/repo', () => repo);

const { clearOdooConnection, getOdooConnection, invalidateOdooConnection, maskSecret, saveOdooConnection } = await import('@/lib/odoo/connection');
const { encryptSecret } = await import('@/lib/settings/crypto');

describe('getOdooConnection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    invalidateOdooConnection();
    vi.stubEnv('SETTINGS_SECRET', 'test-secret-test-secret-test-secret-00');
    vi.stubEnv('ODOO_URL', 'https://env.odoo.test/');
    vi.stubEnv('ODOO_DB', 'envdb');
    vi.stubEnv('ODOO_USERNAME', 'env@x.co');
    vi.stubEnv('ODOO_API_KEY', 'envkey');
    vi.stubEnv('SUPABASE_URL', 'https://sb.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srk');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses env vars when nothing is saved (trailing slash trimmed)', async () => {
    repo.getSetting.mockResolvedValue(null);
    const c = await getOdooConnection();
    expect(c).toMatchObject({ source: 'env', url: 'https://env.odoo.test', db: 'envdb', username: 'env@x.co', apiKey: 'envkey', savedError: null });
  });

  it('skips the database entirely when Supabase is not configured', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    expect((await getOdooConnection()).source).toBe('env');
    expect(repo.getSetting).not.toHaveBeenCalled();
  });

  it('prefers the saved row and decrypts its key, then caches it', async () => {
    repo.getSetting.mockResolvedValue({ key: 'odoo', value: { url: 'https://db.odoo.test', db: 'dbdb', username: 'db@x.co', apiKeyEnc: encryptSecret('dbkey'), apiKeyExpiresAt: '2026-12-31' }, updatedAt: '2026-10-30T10:00:00Z', updatedById: 'u1' });
    const c = await getOdooConnection();
    expect(c).toMatchObject({ source: 'db', url: 'https://db.odoo.test', db: 'dbdb', username: 'db@x.co', apiKey: 'dbkey', apiKeyExpiresAt: '2026-12-31', updatedById: 'u1' });
    await getOdooConnection();
    expect(repo.getSetting).toHaveBeenCalledTimes(1);
  });

  it('falls back to env (with a warning) when the saved key cannot be decrypted', async () => {
    repo.getSetting.mockResolvedValue({ key: 'odoo', value: { url: 'https://db.odoo.test', db: 'dbdb', username: 'db@x.co', apiKeyEnc: 'v1.bad.bad.bad', apiKeyExpiresAt: null }, updatedAt: null, updatedById: null });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await getOdooConnection();
    expect(c.source).toBe('env');
    expect(c.apiKey).toBe('envkey');
    expect(c.savedError).toContain('ถอดรหัส');
    spy.mockRestore();
  });

  it('falls back to env when the settings table cannot be read', async () => {
    repo.getSetting.mockRejectedValue(new Error('relation "AppSetting" does not exist'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await getOdooConnection()).source).toBe('env');
    spy.mockRestore();
  });

  it('saves the key encrypted and refreshes the cache; clearing removes the row', async () => {
    repo.getSetting.mockResolvedValue(null);
    await getOdooConnection();
    await saveOdooConnection({ url: 'https://new.odoo.test/', db: 'n', username: 'n@x.co', apiKey: 'newkey', apiKeyExpiresAt: null }, 'u9');
    const [key, value, by] = repo.putSetting.mock.calls[0];
    expect(key).toBe('odoo');
    expect(by).toBe('u9');
    expect(value.url).toBe('https://new.odoo.test');
    expect(value.apiKeyEnc).not.toContain('newkey');
    expect(value).not.toHaveProperty('apiKey');
    repo.getSetting.mockResolvedValue({ key: 'odoo', value, updatedAt: 'now', updatedById: 'u9' });
    expect((await getOdooConnection()).apiKey).toBe('newkey');
    await clearOdooConnection();
    expect(repo.deleteSetting).toHaveBeenCalledWith('odoo');
  });
});

describe('maskSecret', () => {
  it('shows only the first and last 4 characters', () => {
    expect(maskSecret('abcdefghijklmnopqrstuvwxyz')).toBe('abcd••••••••••••wxyz');
    expect(maskSecret('short')).toBe('•••••');
    expect(maskSecret('')).toBe('');
  });
});
