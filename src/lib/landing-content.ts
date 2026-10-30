/**
 * Editable marketing content for the public landing and catalog pages.
 * Everything here is static copy or configuration, so the sales team can
 * change wording, promotions and FAQ without touching page components.
 */

/**
 * A tyre brand shown on the landing. `code` is the Odoo category prefix (e.g. `YK-PCR` → `YK`)
 * and links the tile to `/tires/brand/[code]`. `logo` is optional until the customer supplies licensed artwork.
 */
export type Brand = { name: string; code?: string; logo?: string };

export const BRANDS: readonly Brand[] = [
  { name: 'Bridgestone', logo: '/landing/brands/bridgestone.webp' },
  { name: 'Michelin', code: 'ML', logo: '/landing/brands/michelin.webp' },
  { name: 'Yokohama', code: 'YK', logo: '/landing/brands/yokohama.webp' },
  { name: 'Lanvigator', code: 'LT', logo: '/landing/brands/lanvigator.webp' },
  { name: 'IRC', code: 'IRC', logo: '/landing/brands/irc.webp' },
  { name: 'Arisun', code: 'AS', logo: '/landing/brands/arisun.webp' },
  { name: 'SR Moto', code: 'SR', logo: '/landing/brands/sr-moto.webp' },
  { name: 'Camel Max', code: 'CM', logo: '/landing/brands/camel-max.webp' },
  { name: 'GS Battery', code: 'GS', logo: '/landing/brands/gs-battery.webp' },
  { name: '3K Battery', code: '3K', logo: '/landing/brands/3k-battery.webp' },
  { name: 'Aonaite', code: 'AN' },
  { name: 'Kpatos', code: 'KT' },
];

/** Logo path for a catalog brand code, when one of the landing brands matches. */
export function brandLogo(code: string): string | undefined {
  return BRANDS.find((b) => b.code === code.toUpperCase())?.logo;
}

/** Display names for Odoo brand codes. Unknown codes fall back to the code itself. */
export const BRAND_CODE_NAMES: Record<string, string> = {
  YK: 'Yokohama', ML: 'Michelin', LT: 'Lanvigator', IRC: 'IRC', AS: 'Arisun', SR: 'SR Moto',
  CM: 'Camel', GS: 'GS Battery', '3K': '3K Battery', AN: 'Aonaite', KT: 'Kpatos',
};

/** Human-readable brand name for a catalog brand code. */
export function brandName(code: string): string {
  return BRAND_CODE_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** Sizes offered as one-tap chips in the hero finder. */
export const POPULAR_SIZES = ['195/65R15', '265/65R17', '215/55R17', '205/55R16', '11R22.5', '90/90-17'] as const;

/** Sizes that get a pre-rendered SEO page at `/tires/size/[slug]`. */
export const SEO_SIZES = [
  '185/60R15', '195/65R15', '215/70R15', '205/55R16', '215/55R17', '215/60R16', '225/50R18', '245/70R16', '265/65R17', '265/60R18', '265/70R16',
  '11R22.5', '295/80R22.5', '12R22.5', '10.00R20',
  '90/90-17', '70/90-17', '100/80-17', '120/70ZR17', '80/90-14', '110/70-17',
] as const;

/** `195/65R15` → `195-65r15`, `11R22.5` → `11r22.5`. Lowercase, URL-safe, reversible enough for search. */
export function sizeSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Best-effort label for a slug: exact match from `SEO_SIZES`, otherwise an uppercased guess. */
export function sizeLabelFromSlug(slug: string): string {
  const known = SEO_SIZES.find((size) => sizeSlug(size) === slug);
  if (known) return known;
  return slug.toUpperCase().replace('-', '/');
}

/** Trust points under the hero. Copy must be confirmed with the customer before go-live. */
export const TRUST_POINTS = [
  { title: 'ส่งถึงร้านทั่วไทย', body: 'จัดส่ง 77 จังหวัด เลือกขนส่งเองได้ตอนยืนยันออเดอร์' },
  { title: 'ใบกำกับภาษีทุกออเดอร์', body: 'เอกสารครบ ออกจากระบบบัญชีบริษัทโดยตรง' },
  { title: 'เครดิตเทอมสำหรับดีลเลอร์', body: 'ดีลเลอร์ที่ผ่านการอนุมัติรับเงื่อนไขชำระเงินตามระดับร้าน' },
  { title: 'เคลมตามเงื่อนไขผู้ผลิต', body: 'ประสานงานเคลมกับแบรนด์ให้ แจ้งผ่าน LINE ได้เลย' },
] as const;

/**
 * Dealer testimonials. Entries marked `placeholder: true` are sample copy and are NOT rendered on the
 * public page: add real quotes (shop, province, quote, with the dealer's consent) and drop the flag.
 */
export type Testimonial = { shop: string; province: string; quote: string; placeholder?: boolean };

export const TESTIMONIALS: readonly Testimonial[] = [
  { shop: 'ร้านยางตัวอย่าง 1', province: 'เชียงใหม่', quote: 'พิมพ์ขนาดแล้วเห็นราคาของร้านเลย ไม่ต้องโทรถามเซลล์ทีละรุ่น', placeholder: true },
  { shop: 'ร้านยางตัวอย่าง 2', province: 'ขอนแก่น', quote: 'สั่งซ้ำออเดอร์เดิมปุ่มเดียว ตอนเช้าสั่ง บ่ายได้เลขพัสดุ', placeholder: true },
  { shop: 'ร้านยางตัวอย่าง 3', province: 'สงขลา', quote: 'สถานะขึ้นใน LINE ทุกขั้น ลูกค้าหน้าร้านถามก็ตอบได้ทันที', placeholder: true },
];

/** Testimonials fit to publish (real ones only). */
export function publishedTestimonials(items: readonly Testimonial[] = TESTIMONIALS): Testimonial[] {
  return items.filter((t) => !t.placeholder);
}

/** Promotions shown on the landing. Dates are ISO strings so the card can hide expired items. */
export type Promotion = { title: string; body: string; image: string; from: string; to: string; href: string };

export const PROMOTIONS: readonly Promotion[] = [
  { title: 'ยางรถยนต์ Yokohama · Michelin · Lanvigator', body: 'ราคาพิเศษดีลเลอร์ประจำเดือน เข้าสู่ระบบเพื่อดูราคาของร้าน', image: '/landing/car-wide.webp', from: '2026-10-01', to: '2026-12-31', href: '/tires?type=CAR' },
  { title: 'ยางมอเตอร์ไซค์ IRC · Arisun · SR Moto', body: 'สั่งครบชุดรับเงื่อนไขพิเศษ สอบถามทีมขายทาง LINE', image: '/landing/moto-wide.webp', from: '2026-10-01', to: '2026-12-31', href: '/tires?type=MOTORCYCLE' },
  { title: 'แบตเตอรี่ 3K · Camel Max · GS', body: 'แบตเตอรี่รถยนต์ครบทุกขนาด ส่งพร้อมยางในออเดอร์เดียว', image: '/landing/battery-wide.webp', from: '2026-10-01', to: '2026-12-31', href: '/tires?type=BATTERY' },
];

/** True when a promotion is live on the given date (inclusive). */
export function isPromotionActive(promo: Promotion, now = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  return promo.from <= day && day <= promo.to;
}

/** FAQ shown on the landing and emitted as `FAQPage` JSON-LD. */
export const FAQ = [
  { q: 'สั่งยางขั้นต่ำกี่เส้น', a: 'ไม่มีขั้นต่ำต่อออเดอร์ สั่ง 1 เส้นก็ได้ ระบบตั้งจำนวนเริ่มต้นเป็นชุด 2 หรือ 4 เส้นตามประเภทยาง ปรับได้ตามต้องการ' },
  { q: 'เปิดร้านยางใหม่ ต้องสั่งยางที่ไหน', a: 'สมัครเป็นดีลเลอร์กับ 12buy Dealer ได้ฟรี เมื่ออนุมัติแล้วสั่งยางรถยนต์ ยางรถบรรทุก ยางมอเตอร์ไซค์ แบตเตอรี่ และกระทะล้อราคาส่งได้ในที่เดียว ไม่ต้องโทรหาซัพพลายเออร์หลายเจ้า' },
  { q: 'ยาง 195/65R15 ใส่รถอะไร', a: 'เป็นขนาดยอดนิยมของรถเก๋งขนาดกลาง เช่น Toyota Corolla Altis รุ่นก่อนปี 2014 และรถอีโคคาร์บางรุ่น ควรตรวจขนาดจริงที่แก้มยางเดิมหรือป้ายข้างประตูรถก่อนสั่ง' },
  { q: 'ยางรถกระบะขนาดไหนนิยม', a: 'กระบะตัวเตี้ยนิยม 215/70R15 กระบะยกสูงและ PPV นิยม 245/70R16 และ 265/65R17 กระบะรุ่นใหม่ล้อ 18 นิ้วนิยม 265/60R18 ค้นด้วยขนาดในระบบเพื่อดูทุกยี่ห้อที่มีสต็อก' },
  { q: 'ส่งกี่วันถึง', a: 'สินค้าที่มีในคลังจัดส่งภายใน 1 วันทำการ กรุงเทพและปริมณฑลถึงใน 1-2 วัน ต่างจังหวัด 2-4 วันตามขนส่งที่เลือก' },
  { q: 'ส่งยางราคาส่งไปต่างจังหวัดได้ไหม', a: 'ส่งได้ทั้ง 77 จังหวัด ร้านยางในเชียงใหม่ ขอนแก่น หาดใหญ่ และจังหวัดอื่นสั่งราคาส่งได้เหมือนร้านในกรุงเทพ ค่าส่งและระยะเวลาขึ้นกับขนส่งที่ร้านได้รับ' },
  { q: 'ชำระเงินอย่างไร มีเครดิตเทอมไหม', a: 'โอนเงินแล้วแนบสลิปในระบบได้ทันที ดีลเลอร์ที่ผ่านการอนุมัติสามารถขอเครดิตเทอมได้ตามระดับร้าน' },
  { q: 'เคลมยางทำอย่างไร', a: 'แจ้งเลขออเดอร์และรูปถ่ายผ่าน LINE ทีมงานประสานกับผู้ผลิตและแจ้งผลตามเงื่อนไขรับประกันของแต่ละแบรนด์' },
  { q: 'สมัครเป็นดีลเลอร์ใช้เวลานานไหม', a: 'กรอกชื่อร้าน จังหวัด และหมวดสินค้าที่ขาย ทีมงานตรวจสอบและเปิดสิทธิ์ภายใน 1 วันทำการ ไม่มีค่าสมัคร' },
  { q: 'ออกใบกำกับภาษีได้ไหม', a: 'ได้ทุกออเดอร์ ระบบออกใบกำกับภาษีเต็มรูปแบบตามข้อมูลร้านที่ลงทะเบียนไว้' },
] as const;
