import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ getSetting: vi.fn(), putSetting: vi.fn(), deleteSetting: vi.fn() }));
vi.mock('@/lib/settings/repo', () => settings);

import { DEFAULT_LANDING } from '../cms';
import { getLandingAdminState, getLandingContent, resetLandingSection, saveLandingSection } from '../repo';

const brands = { show: false, eyebrow: 'B', heading: 'H' };

describe('landing repo', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('falls back to defaults when the database fails', async () => {
    settings.getSetting.mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getLandingContent()).toEqual(DEFAULT_LANDING);
  });

  it('lists customised sections', async () => {
    settings.getSetting.mockResolvedValue({ key: 'landing', value: { brands }, updatedAt: '2026-11-11T00:00:00Z', updatedById: 'u1' });
    const state = await getLandingAdminState();
    expect(state.customised).toEqual(['brands']);
    expect(state.content.brands).toEqual(brands);
  });

  it('save merges one section into the stored overrides', async () => {
    settings.getSetting.mockResolvedValue({ key: 'landing', value: { brands }, updatedAt: '', updatedById: null });
    await saveLandingSection('register', { show: true, heading: 'R', body: 'B' }, 'u1');
    expect(settings.putSetting).toHaveBeenCalledWith('landing', { brands, register: { show: true, heading: 'R', body: 'B' } }, 'u1');
  });

  it('reset removes the section and deletes the row when nothing is left', async () => {
    settings.getSetting.mockResolvedValue({ key: 'landing', value: { brands }, updatedAt: '', updatedById: null });
    await resetLandingSection('brands', 'u1');
    expect(settings.deleteSetting).toHaveBeenCalledWith('landing');
    expect(settings.putSetting).not.toHaveBeenCalled();
  });
});
