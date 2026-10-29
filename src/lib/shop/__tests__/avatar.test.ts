import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ db: () => ({ storage: { from: storage.from } }) }));

const { deleteAvatar, saveAvatar } = await import('@/lib/shop/uploads');
const { sanitizeProfile } = await import('@/lib/shop/dealer');

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('saveAvatar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storage.from.mockReturnValue(storage);
    storage.upload.mockResolvedValue({ error: null });
    storage.remove.mockResolvedValue({ error: null });
  });

  it('stores a real image in the avatars bucket under the dealer id', async () => {
    const result = await saveAvatar('dealer_01', new File([JPEG], 'a.jpg'));
    expect(result).toMatchObject({ ok: true, name: expect.stringMatching(/^dealer01-[a-z0-9]+\.jpg$/) });
    expect(storage.from).toHaveBeenCalledWith('avatars');
    expect(storage.upload).toHaveBeenCalledWith(expect.any(String), expect.any(Uint8Array), { contentType: 'image/jpeg', upsert: false });
  });

  it('rejects a non-image renamed to .jpg', async () => {
    expect(await saveAvatar('d1', new File([new TextEncoder().encode('<svg onload=alert(1)>')], 'x.jpg'))).toEqual({ ok: false, reason: 'รองรับเฉพาะรูป JPG, PNG, WebP' });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects files over 2 MB', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(JPEG);
    expect(await saveAvatar('d1', new File([big], 'big.jpg'))).toEqual({ ok: false, reason: 'ไฟล์ใหญ่เกิน 2 MB' });
  });

  it('never deletes a name outside the strict pattern', async () => {
    await deleteAvatar('../slips/x.jpg');
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('profile avatar', () => {
  it('keeps a valid file name and drops anything else', () => {
    expect(sanitizeProfile({ avatarFile: 'd1-abc.jpg' }).avatarFile).toBe('d1-abc.jpg');
    expect(sanitizeProfile({ avatarFile: '../../etc/passwd' }).avatarFile).toBeNull();
    expect(sanitizeProfile({}).avatarFile).toBeNull();
  });
});
