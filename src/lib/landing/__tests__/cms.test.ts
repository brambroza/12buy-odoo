import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDING, SECTIONS, isSafeHref, isSafeImage, parseSectionForm, resolveLanding, sectionDef, sectionSchema } from '../cms';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe('landing defaults', () => {
  it('every default section passes its own schema', () => {
    for (const def of SECTIONS) {
      const result = sectionSchema(def).safeParse(DEFAULT_LANDING[def.key]);
      expect(result.success, def.key).toBe(true);
    }
  });

  it('covers every section exactly once', () => {
    expect(SECTIONS.map((s) => s.key).sort()).toEqual(Object.keys(DEFAULT_LANDING).sort());
  });
});

describe('resolveLanding', () => {
  it('returns defaults for empty or non-object input', () => {
    expect(resolveLanding(null)).toEqual(DEFAULT_LANDING);
    expect(resolveLanding('x')).toEqual(DEFAULT_LANDING);
  });

  it('applies a valid section override and keeps other defaults', () => {
    const out = resolveLanding({ brands: { show: false, eyebrow: 'B', heading: 'H' } });
    expect(out.brands).toEqual({ show: false, eyebrow: 'B', heading: 'H' });
    expect(out.hero).toEqual(DEFAULT_LANDING.hero);
  });

  it('ignores an invalid section instead of breaking the page', () => {
    const out = resolveLanding({ trust: { show: true, items: [{ title: 'only one', body: 'x' }] }, hero: { badge: 1 } });
    expect(out.trust).toEqual(DEFAULT_LANDING.trust);
    expect(out.hero).toEqual(DEFAULT_LANDING.hero);
  });
});

describe('url guards', () => {
  it('accepts site paths and https images only', () => {
    expect(isSafeImage('/landing/car-wide.webp')).toBe(true);
    expect(isSafeImage('/api/landing-images/landing-abc.webp')).toBe(true);
    expect(isSafeImage('https://cdn.example.com/a.webp')).toBe(true);
    expect(isSafeImage('//evil.com/a.webp')).toBe(false);
    expect(isSafeImage('/landing/../secret')).toBe(false);
    expect(isSafeImage('javascript:alert(1)')).toBe(false);
    expect(isSafeImage('http://plain.example.com/a.webp')).toBe(false);
  });

  it('accepts in-site links and anchors only', () => {
    expect(isSafeHref('/shop?category=car')).toBe(true);
    expect(isSafeHref('#register')).toBe(true);
    expect(isSafeHref('https://evil.com')).toBe(false);
    expect(isSafeHref('//evil.com')).toBe(false);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
  });
});

describe('parseSectionForm', () => {
  const faq = sectionDef('faq')!;

  it('drops blank and deleted rows and sorts by order', () => {
    const result = parseSectionForm(faq, form({
      'f:heading': 'คำถาม', show: 'on', rows: '4',
      'i:0:q': 'Q1', 'i:0:a': 'A1', 'i:0:_order': '2',
      'i:1:q': 'Q2', 'i:1:a': 'A2', 'i:1:_order': '1',
      'i:2:q': 'Q3', 'i:2:a': 'A3', 'i:2:_del': 'on',
      'i:3:q': '', 'i:3:a': '',
    }));
    expect(result).toEqual({ ok: true, value: { heading: 'คำถาม', show: true, items: [{ q: 'Q2', a: 'A2' }, { q: 'Q1', a: 'A1' }] } });
  });

  it('reports a half-filled row', () => {
    const result = parseSectionForm(faq, form({ 'f:heading': 'H', rows: '1', 'i:0:q': 'Q only', 'i:0:a': '' }));
    expect(result).toEqual({ ok: false, error: 'กรอกคำตอบ' });
  });

  it('show is false when the checkbox is unticked', () => {
    const result = parseSectionForm(sectionDef('brands')!, form({ 'f:eyebrow': 'E', 'f:heading': 'H' }));
    expect(result).toEqual({ ok: true, value: { eyebrow: 'E', heading: 'H', show: false } });
  });

  it('uses an uploaded image over the picked one and rejects unsafe links', () => {
    const banners = sectionDef('banners')!;
    const base = { 'f:eyebrow': 'E', 'f:heading': 'H', show: 'on', rows: '1', 'i:0:title': 'T', 'i:0:brands': 'B', 'i:0:wide': '/landing/car-wide.webp', 'i:0:tall': '/landing/car-tall.webp' };
    const ok = parseSectionForm(banners, form({ ...base, 'i:0:href': '/shop' }), { 'i:0:wide': '/api/landing-images/landing-x.webp' });
    expect(ok.ok && (ok.value as { items: { wide: string }[] }).items[0].wide).toBe('/api/landing-images/landing-x.webp');
    const bad = parseSectionForm(banners, form({ ...base, 'i:0:href': 'https://evil.com' }));
    expect(bad.ok).toBe(false);
  });

  it('fixed lists must keep their length', () => {
    const result = parseSectionForm(sectionDef('trust')!, form({ show: 'on', rows: '1', 'i:0:title': 'T', 'i:0:body': 'B' }));
    expect(result).toEqual({ ok: false, error: 'จุดเด่นต้องมี 4 รายการ' });
  });

  it('hero stats coerce numbers and reject text', () => {
    const hero = sectionDef('hero')!;
    const fields = Object.fromEntries(hero.fields.map((f) => [`f:${f.name}`, f.kind === 'image' ? '/landing/hero-tall.webp' : 'x']));
    const stats = { rows: '3', 'i:0:value': '60', 'i:0:suffix': 's', 'i:0:label': 'l', 'i:1:value': '3', 'i:1:suffix': 's', 'i:1:label': 'l', 'i:2:value': '77', 'i:2:suffix': 's', 'i:2:label': 'l' };
    const ok = parseSectionForm(hero, form({ ...fields, ...stats }));
    expect(ok.ok && (ok.value as { items: { value: number }[] }).items.map((i) => i.value)).toEqual([60, 3, 77]);
    expect(parseSectionForm(hero, form({ ...fields, ...stats, 'i:1:value': 'abc' })).ok).toBe(false);
  });
});
