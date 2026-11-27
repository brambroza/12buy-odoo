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

/** Words written before a subdistrict, district or province name in free-text Thai addresses. */
const LEVEL_PREFIX = /(?:ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.)\s*$/;

/** `text` with the last occurrence of `part` blanked out (same length, so positions still match `text`). */
function removeLast(text: string, part: string): string {
  const at = text.lastIndexOf(part);
  return at < 0 ? text : `${text.slice(0, at)}${' '.repeat(part.length)}${text.slice(at + part.length)}`;
}

/**
 * Where `name` stands as its own word (after a space or ต./ตำบล/แขวง, before a space, comma or อ./อำเภอ/เขต),
 * else where it first appears inside another word, else -1. "ถนนสีคิ้ว-ชัยภูมิ สีคิ้ว" finds the second สีคิ้ว.
 */
function findName(text: string, name: string): { at: number; word: boolean } {
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    const before = text.slice(0, at);
    const after = text.slice(at + name.length);
    if ((!before || /(?:\s|ตำบล|ต\.|แขวง)$/.test(before)) && (!after || /^(?:[\s,]|อ\.|อำเภอ|เขต)/.test(after))) return { at, word: true };
  }
  return { at: text.indexOf(name), word: false };
}

/**
 * Best-effort structured address from one free-text line, e.g. an Odoo partner's street/street2/city/zip
 * or the `Dealer.address` saved before the picker existed. The ตำบล/แขวง and อำเภอ/เขต must both appear in
 * the text; the postal code or province (from the text or `provinceHint`) breaks ties. Everything before the
 * ตำบล/แขวง becomes `line`. Returns null when no single subdistrict fits, so the caller asks the dealer instead.
 */
export function guessThaiAddress(data: ThaiAddressData, text: string, provinceHint?: string | null): ThaiAddress | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const zip = [...clean.matchAll(/(?<!\d)\d{5}(?!\d)/g)].at(-1)?.[0] ?? null;
  const hint = provinceHint?.replace(/^จังหวัด/, '').trim() || null;
  type Hit = { province: string; district: string; subdistrict: string; postalCode: string; score: number; at: number };
  let best: Hit | null = null;
  let tie = false;
  for (const [province, districts] of data) {
    const provinceInText = clean.includes(province) || (province === BANGKOK && /กรุงเทพ|กทม/.test(clean));
    const provinceKnown = provinceInText || hint === province;
    // The province name itself is not the ตำบล (ตำบลกาฬสินธุ์ only counts when it appears a second time).
    const withoutProvince = clean.includes(province) ? removeLast(clean, province) : clean;
    for (const [district, subs] of districts) {
      // "เมืองเชียงใหม่" is often written "อ.เมือง จ.เชียงใหม่", a bare "เมือง" word (Odoo city field)
      // or "อำเภอสมุทรสาคร".
      const town = district.startsWith('เมือง') ? district.slice('เมือง'.length) : '';
      const districtInText = clean.includes(district)
        || (Boolean(town) && provinceInText && /(?:อ\.|อำเภอ)\s*เมือง|(?:^|\s)เมือง(?=\s|$)/.test(clean))
        || (Boolean(town) && (clean.includes(`อำเภอ${town}`) || clean.includes(`อ.${town}`)));
      if (!districtInText) continue;
      // The อำเภอ name is not the ตำบล either: "พระขาว บางบาล" is ตำบลพระขาว, not ตำบลบางบาล.
      const rest = withoutProvince.includes(district) ? removeLast(withoutProvince, district) : withoutProvince;
      for (const [subdistrict, postalCode] of subs) {
        const found = findName(rest, subdistrict);
        if (found.at < 0) continue;
        // The dataset keeps one zip per ตำบล; a different zip in the text still fits when the province is known.
        const zipMatches = !zip || postalCode === zip;
        if (!zipMatches && !provinceKnown) continue;
        const score = subdistrict.length + district.length + (provinceInText ? 20 : 0) + (hint === province ? 10 : 0) + (zip && zipMatches ? 20 : 0) + (found.word ? 15 : 0);
        const hit = { province, district, subdistrict, postalCode: zip ?? postalCode, score, at: found.at };
        if (!best || score > best.score) { best = hit; tie = false; }
        else if (score === best.score) tie = true;
      }
    }
  }
  if (!best || tie) return null;
  if (!zip && !best.score) return null;
  // `line` = text before the subdistrict, without its ต./แขวง prefix or trailing separators.
  const line = clean.slice(0, best.at).replace(LEVEL_PREFIX, '').replace(/[\s,]+$/, '').trim();
  return { line, subdistrict: best.subdistrict, district: best.district, province: best.province, postalCode: best.postalCode };
}
