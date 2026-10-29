/**
 * Thai administrative address helpers (จังหวัด → อำเภอ/เขต → ตำบล/แขวง → รหัสไปรษณีย์).
 * Data lives in `src/data/thai-address.json` (generated from kongvut/thai-province-data):
 * `[province, [district, [subdistrict, postalCode][]][]][]`, names without prefixes.
 * Helpers take the data as an argument so client code can load it lazily.
 */

export type ThaiAddressData = [string, [string, [string, string][]][]][];

/** Structured delivery address stored on the dealer and composed into one line for orders. */
export type ThaiAddress = { line: string; subdistrict: string; district: string; province: string; postalCode: string };

const BANGKOK = 'กรุงเทพมหานคร';
const collator = new Intl.Collator('th');
const byThai = (a: string, b: string) => collator.compare(a, b);

/** All province names in Thai alphabetical order. */
export function listProvinces(data: ThaiAddressData): string[] {
  return data.map(([name]) => name).sort(byThai);
}

/** Districts (อำเภอ/เขต) of a province, sorted; empty when the province is unknown. */
export function listDistricts(data: ThaiAddressData, province: string): string[] {
  return (data.find(([name]) => name === province)?.[1] ?? []).map(([name]) => name).sort(byThai);
}

/** Subdistricts (ตำบล/แขวง) of a district with their postal codes, sorted by name. */
export function listSubdistricts(data: ThaiAddressData, province: string, district: string): { name: string; postalCode: string }[] {
  const districts = data.find(([name]) => name === province)?.[1] ?? [];
  const subs = districts.find(([name]) => name === district)?.[1] ?? [];
  return subs.map(([name, postalCode]) => ({ name, postalCode })).sort((a, b) => byThai(a.name, b.name));
}

/** Default postal code for a subdistrict, or null when the combination does not exist. */
export function findPostalCode(data: ThaiAddressData, province: string, district: string, subdistrict: string): string | null {
  return listSubdistricts(data, province, district).find((s) => s.name === subdistrict)?.postalCode ?? null;
}

/** Labels for each level; Bangkok uses เขต/แขวง instead of อำเภอ/ตำบล. */
export function levelLabels(province: string): { district: string; subdistrict: string } {
  return province === BANGKOK ? { district: 'เขต', subdistrict: 'แขวง' } : { district: 'อำเภอ', subdistrict: 'ตำบล' };
}

/** One-line address for labels and orders, e.g. `99 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110`. */
export function formatThaiAddress(address: ThaiAddress): string {
  const labels = levelLabels(address.province);
  const province = address.province === BANGKOK ? address.province : `จังหวัด${address.province}`;
  return [address.line.trim(), `${labels.subdistrict}${address.subdistrict}`, `${labels.district}${address.district}`, province, address.postalCode]
    .filter(Boolean).join(' ');
}

/** Reads a stored JSON value back into a ThaiAddress, or null when it is missing or malformed. */
export function parseThaiAddress(value: unknown): ThaiAddress | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const keys = ['line', 'subdistrict', 'district', 'province', 'postalCode'] as const;
  if (!keys.every((k) => typeof v[k] === 'string')) return null;
  return { line: v.line as string, subdistrict: v.subdistrict as string, district: v.district as string, province: v.province as string, postalCode: v.postalCode as string };
}
