/**
 * Editable landing-page content ("CMS" for `/`). Each section has a coded default (the copy that
 * shipped with the site) and admins override it section by section from `/admin/landing`.
 * Saved overrides live in `AppSetting` key `landing` as `{ [section]: value }`; a section that is
 * missing or no longer passes its schema falls back to the default, so a bad row never breaks `/`.
 *
 * Icons and layout stay in code: lists bound to icons (stats, trust points, categories, features,
 * steps) have a fixed length and only their text is editable.
 */
import { z } from 'zod';
import { FAQ, TRUST_POINTS } from '@/lib/landing-content';

export type FieldKind = 'text' | 'textarea' | 'image' | 'href' | 'number';

/** One editable input. `optional` fields may be left blank. */
export type FieldDef = { name: string; label: string; kind: FieldKind; max?: number; optional?: boolean; hint?: string };

/** A repeated group of fields (FAQ entries, banners, …). `fixed` lists keep their length. */
export type ListDef = { label: string; fields: FieldDef[]; min: number; max: number; fixed?: boolean };

export type SectionDef = {
  key: SectionKey;
  label: string;
  description: string;
  /** Sections other than the hero can be hidden from the page. */
  hideable: boolean;
  fields: FieldDef[];
  list?: ListDef;
};

export type ListItem = Record<string, string | number>;

export type HeroContent = {
  badge: string; titleLine1: string; titleAccent: string; titleLine3: string; sub: string;
  primaryCta: string; secondaryCta: string; image: string; imageAlt: string;
  brandsLabel: string; brandsText: string; brandsBadge: string;
  items: { value: number; suffix: string; label: string }[];
};
type Shown = { show: boolean };
export type LandingContent = {
  hero: HeroContent;
  trust: Shown & { items: { title: string; body: string }[] };
  brands: Shown & { eyebrow: string; heading: string };
  categories: Shown & { heading: string; sub: string; items: { label: string; note: string }[] };
  banners: Shown & { eyebrow: string; heading: string; items: { title: string; brands: string; wide: string; tall: string; href: string }[] };
  demo: Shown & { eyebrow: string; heading: string; body: string; items: { text: string }[] };
  features: Shown & { heading: string; items: { title: string; body: string }[] };
  steps: Shown & { heading: string; statusHeading: string; items: { title: string; body: string }[] };
  testimonials: Shown & { eyebrow: string; heading: string; items: { shop: string; province: string; quote: string }[] };
  faq: Shown & { heading: string; items: { q: string; a: string }[] };
  register: Shown & { heading: string; body: string };
};
export type SectionKey = keyof LandingContent;

const T = (name: string, label: string, max = 120, extra: Partial<FieldDef> = {}): FieldDef => ({ name, label, kind: 'text', max, ...extra });
const A = (name: string, label: string, max = 600, extra: Partial<FieldDef> = {}): FieldDef => ({ name, label, kind: 'textarea', max, ...extra });

export const SECTIONS: readonly SectionDef[] = [
  {
    key: 'hero', label: 'ส่วนบน (Hero)', description: 'หัวข้อใหญ่ ข้อความ ปุ่ม รูปหลัก และตัวเลขสถิติ 3 ช่อง', hideable: false,
    fields: [
      T('badge', 'ป้ายเล็กเหนือหัวข้อ', 80), T('titleLine1', 'หัวข้อ บรรทัด 1', 60), T('titleAccent', 'หัวข้อ บรรทัด 2 (สีแดง)', 60), T('titleLine3', 'หัวข้อ บรรทัด 3', 60, { optional: true }),
      A('sub', 'ข้อความใต้หัวข้อ', 300), T('primaryCta', 'ปุ่มหลัก (ค้นหายาง)', 40), T('secondaryCta', 'ปุ่มรอง (เข้าสู่ระบบ)', 40),
      { name: 'image', label: 'รูปหลัก (แนะนำสี่เหลี่ยมจัตุรัส)', kind: 'image' }, T('imageAlt', 'คำอธิบายรูป (alt สำหรับ SEO)', 160),
      T('brandsLabel', 'หัวข้อใต้รูป', 40), T('brandsText', 'รายชื่อแบรนด์ใต้รูป', 120), T('brandsBadge', 'ป้ายมุมขวา', 20, { optional: true }),
    ],
    list: { label: 'ตัวเลขสถิติ', min: 3, max: 3, fixed: true, fields: [{ name: 'value', label: 'ตัวเลข', kind: 'number' }, T('suffix', 'หน่วย', 20), T('label', 'คำอธิบาย', 40)] },
  },
  {
    key: 'trust', label: 'แถบจุดเด่น', description: '4 ข้อใต้ช่องค้นหา (ไอคอนคงที่ตามลำดับ: ส่งทั่วไทย · เอกสาร · เครดิต · เคลม)', hideable: true, fields: [],
    list: { label: 'จุดเด่น', min: 4, max: 4, fixed: true, fields: [T('title', 'หัวข้อ', 60), A('body', 'รายละเอียด', 160)] },
  },
  { key: 'brands', label: 'หัวข้อแบรนด์', description: 'หัวข้อเหนือตารางโลโก้แบรนด์ (โลโก้จัดการในโค้ด)', hideable: true, fields: [T('eyebrow', 'ป้ายเล็ก', 40), T('heading', 'หัวข้อ', 120)] },
  {
    key: 'categories', label: 'หมวดสินค้า', description: '5 การ์ดหมวดสินค้า (ไอคอนคงที่ตามลำดับ: รถยนต์ · บรรทุก · มอเตอร์ไซค์ · แบตเตอรี่ · กระทะล้อ)', hideable: true,
    fields: [T('heading', 'หัวข้อ', 120), A('sub', 'คำอธิบาย', 300)],
    list: { label: 'หมวด', min: 5, max: 5, fixed: true, fields: [T('label', 'ชื่อหมวด', 40), T('note', 'คำอธิบายสั้น', 60)] },
  },
  {
    key: 'banners', label: 'แบนเนอร์สินค้า', description: 'แบนเนอร์ใหญ่ รูปแนวนอนสำหรับคอมพิวเตอร์ (ประมาณ 3:1) และแนวตั้งสำหรับมือถือ (ประมาณ 7:10)', hideable: true,
    fields: [T('eyebrow', 'ป้ายเล็ก', 40), T('heading', 'หัวข้อ', 120)],
    list: {
      label: 'แบนเนอร์', min: 1, max: 6,
      fields: [T('title', 'ชื่อหมวด', 40), T('brands', 'แบรนด์ในรูป', 120), { name: 'wide', label: 'รูปแนวนอน (คอมพิวเตอร์)', kind: 'image' }, { name: 'tall', label: 'รูปแนวตั้ง (มือถือ)', kind: 'image' }, { name: 'href', label: 'ลิงก์เมื่อกด', kind: 'href' }],
    },
  },
  {
    key: 'demo', label: 'ตัวอย่างการค้นหา', description: 'ส่วน “ลองเลย” ข้างกล่องตัวอย่างค้นหาขนาดยาง', hideable: true,
    fields: [T('eyebrow', 'ป้ายเล็ก', 40), T('heading', 'หัวข้อ', 120), A('body', 'ข้อความ', 400)],
    list: { label: 'ข้อดี', min: 0, max: 6, fields: [T('text', 'ข้อความ', 120)] },
  },
  {
    key: 'features', label: 'ฟีเจอร์', description: '6 การ์ดฟีเจอร์ (ไอคอนคงที่ตามลำดับ)', hideable: true,
    fields: [T('heading', 'หัวข้อ', 120)],
    list: { label: 'ฟีเจอร์', min: 6, max: 6, fixed: true, fields: [T('title', 'หัวข้อ', 60), A('body', 'รายละเอียด', 200)] },
  },
  {
    key: 'steps', label: 'วิธีเริ่มใช้งาน', description: '3 ขั้นตอน และหัวข้อแถบสถานะออเดอร์', hideable: true,
    fields: [T('heading', 'หัวข้อ', 120), T('statusHeading', 'หัวข้อแถบสถานะออเดอร์', 80)],
    list: { label: 'ขั้นตอน', min: 3, max: 3, fixed: true, fields: [T('title', 'หัวข้อ', 60), A('body', 'รายละเอียด', 200)] },
  },
  {
    key: 'testimonials', label: 'เสียงจากดีลเลอร์', description: 'แสดงเมื่อมีอย่างน้อย 1 รายการ ใส่เฉพาะคำพูดจริงที่ร้านยินยอมให้เผยแพร่', hideable: true,
    fields: [T('eyebrow', 'ป้ายเล็ก', 40), T('heading', 'หัวข้อ', 120)],
    list: { label: 'รีวิว', min: 0, max: 9, fields: [T('shop', 'ชื่อร้าน', 80), T('province', 'จังหวัด', 40), A('quote', 'คำพูด', 300)] },
  },
  {
    key: 'faq', label: 'คำถามที่พบบ่อย', description: 'ใช้ทั้งบนหน้าเว็บและข้อมูล FAQ สำหรับ Google (JSON-LD)', hideable: true,
    fields: [T('heading', 'หัวข้อ', 120)],
    list: { label: 'คำถาม', min: 1, max: 20, fields: [T('q', 'คำถาม', 160), A('a', 'คำตอบ', 800)] },
  },
  { key: 'register', label: 'สมัครดีลเลอร์', description: 'ข้อความข้างฟอร์มสมัคร (เบอร์โทรและ LINE มาจากข้อมูลบริษัท)', hideable: true, fields: [T('heading', 'หัวข้อ', 120), A('body', 'ข้อความ', 400)] },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);

export function sectionDef(key: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.key === key);
}

/** The copy that shipped with the site; shown until an admin saves a section. */
export const DEFAULT_LANDING: LandingContent = {
  hero: {
    badge: 'สำหรับดีลเลอร์ยางโดยเฉพาะ ใช้งานบนมือถือ',
    titleLine1: 'ศูนย์รวมยางครบทุกประเภท', titleAccent: 'สั่งได้ใน 60 วินาที', titleLine3: 'จากมือถือของคุณ',
    sub: 'ยางรถยนต์ ยางมอเตอร์ไซค์ ยางรถบรรทุก และแบตเตอรี่ จากแบรนด์ชั้นนำ พิมพ์ขนาดเห็นราคาของร้านทันที สั่งซ้ำ 1 ปุ่ม จัดส่งทั่วไทย',
    primaryCta: 'ค้นหายางตามขนาด', secondaryCta: 'เข้าสู่ระบบดีลเลอร์',
    image: '/landing/hero-tall.webp', imageAlt: 'ยางรถยนต์ ยางมอเตอร์ไซค์ ยางรถบรรทุก และแบตเตอรี่จากแบรนด์ชั้นนำ',
    brandsLabel: 'แบรนด์ที่จำหน่าย', brandsText: 'Bridgestone · Michelin · Yokohama · IRC · GS · 3K', brandsBadge: '10+ แบรนด์',
    items: [
      { value: 60, suffix: 'วินาที', label: 'สั่งสินค้าที่รู้ขนาดแล้ว' },
      { value: 3, suffix: 'แตะ', label: 'สั่งซ้ำออเดอร์เดิม' },
      { value: 77, suffix: 'จังหวัด', label: 'จัดส่งทั่วไทย' },
    ],
  },
  trust: { show: true, items: TRUST_POINTS.map(({ title, body }) => ({ title, body })) },
  brands: { show: true, eyebrow: 'แบรนด์', heading: 'แบรนด์ชั้นนำที่ดีลเลอร์สั่งได้ทันที' },
  categories: {
    show: true, heading: 'ครบทุกหมวดที่ร้านยางต้องมี', sub: 'สั่งได้เฉพาะหมวดที่ร้านของคุณเปิดสิทธิ์ ราคาและสต็อกอัปเดตจากระบบคลังโดยตรง',
    items: [
      { label: 'ยางรถยนต์', note: 'เก๋ง กระบะ SUV' },
      { label: 'ยางรถบรรทุก', note: 'TBR ทุกขนาด' },
      { label: 'ยางมอเตอร์ไซค์', note: 'ครอบครัว สปอร์ต บิ๊กไบค์' },
      { label: 'แบตเตอรี่', note: 'ทุกยี่ห้อยอดนิยม' },
      { label: 'กระทะล้อ', note: 'เหล็ก อัลลอย' },
    ],
  },
  banners: {
    show: true, eyebrow: 'แคตตาล็อก', heading: 'สินค้าออนไลน์ สั่งได้ 24 ชั่วโมง',
    items: [
      { title: 'ยางรถยนต์', brands: 'Yokohama · Michelin · Lanvigator', wide: '/landing/car-wide.webp', tall: '/landing/car-tall.webp', href: '/shop?category=car' },
      { title: 'ยางมอเตอร์ไซค์', brands: 'IRC · Arisun · SR Moto', wide: '/landing/moto-wide.webp', tall: '/landing/moto-tall.webp', href: '/shop?category=motorcycle' },
      { title: 'แบตเตอรี่รถยนต์', brands: '3K · Camel Max · GS', wide: '/landing/battery-wide.webp', tall: '/landing/battery-tall.webp', href: '/shop?category=battery' },
    ],
  },
  demo: {
    show: true, eyebrow: 'ลองเลย', heading: 'ค้นยางคิดเป็นขนาด ไม่ใช่ยี่ห้อ',
    body: 'ช่องเดียว พิมพ์ขนาดแบบไหนก็หาเจอ ระบบเข้าใจทั้ง 195/65R15, 195 65 15 และ 1956515 แล้วแสดงทุกยี่ห้อที่มีพร้อมราคาและสต็อก',
    items: [{ text: 'เรียงราคาถูกไปแพงอัตโนมัติ' }, { text: 'เห็นขนาดเดียวกันยี่ห้ออื่นในหน้าสินค้า' }, { text: 'จำนวนเริ่มต้นเป็นชุด 2 หรือ 4 เส้นตามประเภท' }],
  },
  features: {
    show: true, heading: 'ขายให้ได้มากที่สุด ด้วยขั้นตอนน้อยที่สุด',
    items: [
      { title: 'ค้นหาด้วยขนาด', body: 'พิมพ์ 195/65R15 หรือ 1956515 ก็หาเจอ เห็นทุกยี่ห้อ เรียงราคาถูกไปแพง' },
      { title: 'ราคาของร้านคุณ', body: 'ไม่มีราคากลางให้สับสน ทุกหน้าแสดงราคาตามสิทธิ์ของร้านทันทีที่เข้าสู่ระบบ' },
      { title: 'สั่งซ้ำ 1 ปุ่ม', body: 'ออเดอร์ล่าสุดและสินค้าที่สั่งบ่อยอยู่หน้าแรก กดเดียวลงตะกร้า' },
      { title: 'สั่งเร็วหลายรายการ', body: 'วางรายการ ขนาด จำนวน หลายบรรทัดลงตะกร้าทีเดียว เหมาะดีลเลอร์สั่งทีละสิบรายการ' },
      { title: 'สต็อกบอกตรงๆ', body: 'มี เหลือน้อย หรือสั่งจอง รู้ก่อนกดสั่ง ไม่ต้องโทรถาม' },
      { title: 'แจ้งเตือนผ่าน LINE', body: 'สถานะเปลี่ยนทุกขั้น รู้ทันทีใน LINE พร้อมลิงก์กลับมาดูออเดอร์' },
    ],
  },
  steps: {
    show: true, heading: 'เริ่มใช้งานใน 3 ขั้น', statusHeading: 'สถานะออเดอร์ที่เข้าใจง่าย',
    items: [
      { title: 'สมัครและรออนุมัติ', body: 'แจ้งชื่อร้าน จังหวัด ประเภทสินค้าที่ขาย ทีมงานตรวจสอบและเปิดสิทธิ์ให้ภายใน 1 วันทำการ' },
      { title: 'ค้นหาและสั่งซื้อ', body: 'พิมพ์ขนาดยาง เห็นราคาของร้าน กดลงตะกร้า ยืนยันที่อยู่และขนส่งหน้าเดียว' },
      { title: 'ติดตามจนถึงมือ', body: 'ดูสถานะเป็นไทม์ไลน์ แนบสลิปโอนเงินได้ในแอป รับแจ้งเตือนทาง LINE ทุกขั้น' },
    ],
  },
  // Coded samples were placeholders and never published, so the default list is empty.
  testimonials: { show: true, eyebrow: 'เสียงจากดีลเลอร์', heading: 'ร้านยางทั่วไทยใช้งานจริง', items: [] },
  faq: { show: true, heading: 'คำถามที่ดีลเลอร์ถามบ่อย', items: FAQ.map(({ q, a }) => ({ q, a })) },
  register: { show: true, heading: 'เปิดร้านยาง? สมัครเป็นดีลเลอร์กับเรา', body: 'กรอกข้อมูลร้านสั้นๆ หรือทักมาทาง LINE ทีมงานเปิดสิทธิ์ให้ภายใน 1 วันทำการ ไม่มีค่าสมัคร' },
};

/** Site path (`/landing/x.webp`, `/api/landing-images/x.webp`) or https URL; no protocol-relative or traversal. */
export function isSafeImage(v: string): boolean {
  return (v.startsWith('/') && !v.startsWith('//') && !v.includes('..') && !v.includes('\\')) || /^https:\/\/[^\s"']+$/.test(v);
}

/** In-site link (`/shop?…`) or same-page anchor (`#register`). External links are not allowed. */
export function isSafeHref(v: string): boolean {
  return (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) || /^#[\w-]+$/.test(v);
}

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  if (f.kind === 'number') return z.coerce.number({ message: `${f.label}: ต้องเป็นตัวเลข` }).int(`${f.label}: ต้องเป็นจำนวนเต็ม`).min(0).max(1_000_000);
  let s = z.string().trim().max(f.max ?? 500, `${f.label}: ยาวเกิน ${f.max ?? 500} ตัวอักษร`);
  if (!f.optional) s = s.min(1, `กรอก${f.label}`);
  if (f.kind === 'image') return s.refine((v) => isSafeImage(v), `${f.label}: ต้องเป็นรูปในเว็บหรือ https URL`);
  if (f.kind === 'href') return s.refine((v) => isSafeHref(v), `${f.label}: ต้องเป็นหน้าในเว็บ เช่น /tires?type=CAR หรือ #register`);
  return s;
}

/** Zod schema for one section's stored value, derived from its definition. */
export function sectionSchema(def: SectionDef): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.fields) shape[f.name] = fieldSchema(f);
  if (def.hideable) shape.show = z.boolean();
  if (def.list) {
    const { list } = def;
    const item = z.object(Object.fromEntries(list.fields.map((f) => [f.name, fieldSchema(f)])));
    shape.items = z.array(item)
      .min(list.min, list.fixed ? `${list.label}ต้องมี ${list.min} รายการ` : `ต้องมี${list.label}อย่างน้อย ${list.min} รายการ`)
      .max(list.max, `${list.label}ได้ไม่เกิน ${list.max} รายการ`);
  }
  return z.object(shape);
}

/** Merges saved overrides onto the defaults; invalid or missing sections use the default. */
export function resolveLanding(saved: unknown): LandingContent {
  const out = { ...DEFAULT_LANDING } as Record<SectionKey, unknown>;
  if (!saved || typeof saved !== 'object') return out as LandingContent;
  for (const def of SECTIONS) {
    const raw = (saved as Record<string, unknown>)[def.key];
    if (raw === undefined) continue;
    const parsed = sectionSchema(def).safeParse(raw);
    if (parsed.success) out[def.key] = parsed.data;
  }
  return out as LandingContent;
}

/** Form input names: `f:<field>` for section fields, `i:<row>:<field>` for list rows. */
export const fieldName = (name: string) => `f:${name}`;
export const itemName = (row: number, name: string) => `i:${row}:${name}`;

/**
 * Reads a section form into a plain object (not yet validated). `uploads` maps an input name to an
 * uploaded image path that replaces the picked value. Rows ticked `_del` and fully blank rows of
 * variable lists are dropped; `_order` re-sorts rows.
 */
export function readSectionForm(def: SectionDef, form: FormData, uploads: Record<string, string> = {}): Record<string, unknown> {
  const value = (name: string) => uploads[name] ?? String(form.get(name) ?? '');
  const out: Record<string, unknown> = {};
  for (const f of def.fields) out[f.name] = value(fieldName(f.name));
  if (def.hideable) out.show = form.get('show') === 'on';
  if (def.list) {
    const { list } = def;
    const rows = Math.min(Number(form.get('rows')) || 0, list.max + 5);
    const items: { order: number; item: ListItem }[] = [];
    for (let r = 0; r < rows; r++) {
      const item: ListItem = {};
      for (const f of list.fields) item[f.name] = value(itemName(r, f.name)).trim();
      if (!list.fixed) {
        if (form.get(itemName(r, '_del')) === 'on') continue;
        // Images default to a picked preset, so only text fields decide whether a new row was used.
        const texts = list.fields.filter((f) => f.kind !== 'image' && f.kind !== 'number');
        if (texts.every((f) => item[f.name] === '')) continue;
      }
      const order = Number(form.get(itemName(r, '_order')));
      items.push({ order: Number.isFinite(order) && form.get(itemName(r, '_order')) !== '' ? order : r + 1, item });
    }
    out.items = items.sort((a, b) => a.order - b.order).map((x) => x.item);
  }
  return out;
}

/** Validates a section form. Returns the clean value or the first Thai error message. */
export function parseSectionForm(def: SectionDef, form: FormData, uploads: Record<string, string> = {}): { ok: true; value: unknown } | { ok: false; error: string } {
  const parsed = sectionSchema(def).safeParse(readSectionForm(def, form, uploads));
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
}

/** Images uploaded from the back office are served by our own route and skip the optimizer. */
export function isUploadedImage(src: string): boolean {
  return src.startsWith('/api/landing-images/') || src.startsWith('https://');
}
