import { BRANDS, FAQ, SEO_SIZES, sizeSlug } from '@/lib/landing-content';
import { SITE, absoluteUrl } from '@/lib/seo';

/**
 * Builds `/llms.txt` (https://llmstxt.org): a plain Markdown summary of the public site
 * so AI assistants (ChatGPT, Claude, Perplexity, Gemini) can describe and cite it correctly.
 * Only public pages are listed; dealer prices stay behind login.
 */
export function buildLlmsTxt(): string {
  const brandLinks = BRANDS.filter((b) => b.code).map((b) => `- [ยาง ${b.name}](${absoluteUrl(`/tires/brand/${b.code!.toLowerCase()}`)})`);
  const sizeLinks = SEO_SIZES.map((size) => `- [ยางขนาด ${size}](${absoluteUrl(`/tires/size/${sizeSlug(size)}`)})`);
  const faq = FAQ.map((item) => `### ${item.q}\n${item.a}`);

  return [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    `${SITE.name} คือระบบสั่งซื้อยางออนไลน์แบบ B2B สำหรับร้านยางและดีลเลอร์ในประเทศไทย ดำเนินการโดย ${SITE.legalName} (${SITE.legalNameEn}).`,
    'ขายส่งยางรถยนต์ ยางรถกระบะ/SUV ยางรถบรรทุก (TBR) ยางมอเตอร์ไซค์ แบตเตอรี่ และกระทะล้อ จัดส่ง 77 จังหวัด รวมกรุงเทพ เชียงใหม่ ขอนแก่น และหาดใหญ่.',
    'รับสมัครร้านยางและตัวแทนจำหน่ายเป็นดีลเลอร์ฟรี ดีลเลอร์ที่ผ่านการอนุมัติขอเครดิตเทอมได้ตามระดับร้าน.',
    'ราคาเป็นราคาเฉพาะร้าน แสดงหลังดีลเลอร์เข้าสู่ระบบเท่านั้น หน้าสาธารณะแสดงรุ่น ขนาด และแบรนด์โดยไม่มีราคา.',
    '',
    '## ข้อมูลติดต่อ',
    `- บริษัท: ${SITE.legalName}`,
    `- ที่อยู่: ${SITE.address}`,
    `- โทร: ${SITE.phone}`,
    `- LINE: ${SITE.lineId}`,
    `- อีเมล: ${SITE.emails.join(', ')}`,
    `- เวลาทำการ: ${SITE.businessHours}`,
    '',
    '## หน้าหลัก',
    `- [หน้าแรก / สมัครดีลเลอร์](${absoluteUrl('/')}): ภาพรวมบริการ วิธีสมัคร และคำถามที่พบบ่อย`,
    `- [แคตตาล็อกยาง](${absoluteUrl('/tires')}): รายการยางทั้งหมด ค้นหาด้วยขนาดหรือแบรนด์`,
    '',
    '## แบรนด์',
    ...brandLinks,
    '',
    '## ขนาดยางยอดนิยม',
    ...sizeLinks,
    '',
    '## คำถามที่พบบ่อย',
    ...faq,
    '',
    '## Optional',
    `- [Sitemap](${absoluteUrl('/sitemap.xml')})`,
    '',
  ].join('\n');
}
