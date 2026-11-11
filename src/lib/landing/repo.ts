import { deleteSetting, getSetting, putSetting } from '@/lib/settings/repo';
import { DEFAULT_LANDING, resolveLanding, type LandingContent, type SectionKey } from './cms';

/** `AppSetting` key holding `{ [section]: value }` overrides for the landing page. */
export const LANDING_SETTING_KEY = 'landing';

type Stored = Partial<Record<SectionKey, unknown>>;

async function readStored(): Promise<{ value: Stored; updatedAt: string | null; updatedById: string | null }> {
  const row = await getSetting<Stored>(LANDING_SETTING_KEY);
  return { value: row?.value && typeof row.value === 'object' ? row.value : {}, updatedAt: row?.updatedAt ?? null, updatedById: row?.updatedById ?? null };
}

/** Landing content for `/`: saved overrides on top of the defaults. Never throws (DB down → defaults). */
export async function getLandingContent(): Promise<LandingContent> {
  try {
    return resolveLanding((await readStored()).value);
  } catch (error) {
    console.error('[landing] content load failed, using defaults', error);
    return DEFAULT_LANDING;
  }
}

/** Content plus which sections an admin has customised (for the back office). */
export async function getLandingAdminState(): Promise<{ content: LandingContent; customised: SectionKey[]; updatedAt: string | null; updatedById: string | null }> {
  const stored = await readStored();
  return { content: resolveLanding(stored.value), customised: Object.keys(stored.value) as SectionKey[], updatedAt: stored.updatedAt, updatedById: stored.updatedById };
}

/** Replaces one section's override (value must already be validated). */
export async function saveLandingSection(key: SectionKey, value: unknown, actorId: string): Promise<void> {
  const stored = await readStored();
  await putSetting(LANDING_SETTING_KEY, { ...stored.value, [key]: value }, actorId);
}

/** Drops one section's override so the default copy shows again. */
export async function resetLandingSection(key: SectionKey, actorId: string): Promise<void> {
  const stored = await readStored();
  const rest = { ...stored.value };
  delete rest[key];
  if (Object.keys(rest).length === 0) await deleteSetting(LANDING_SETTING_KEY);
  else await putSetting(LANDING_SETTING_KEY, rest, actorId);
}
