import { db } from '@/lib/db/client';
import { rowOrNull, unwrap } from '@/lib/db/rows';

export type AppSettingRow<T> = { key: string; value: T; updatedAt: string; updatedById: string | null };

/** One setting row, or null when it was never saved. */
export async function getSetting<T>(key: string): Promise<AppSettingRow<T> | null> {
  return rowOrNull<AppSettingRow<T>>(await db().from('AppSetting').select('*').eq('key', key).maybeSingle());
}

/** Creates or replaces a setting. */
export async function putSetting<T>(key: string, value: T, updatedById: string | null): Promise<void> {
  unwrap(await db().from('AppSetting').upsert({ key, value, updatedAt: new Date().toISOString(), updatedById }, { onConflict: 'key' }));
}

export async function deleteSetting(key: string): Promise<void> {
  unwrap(await db().from('AppSetting').delete().eq('key', key));
}
