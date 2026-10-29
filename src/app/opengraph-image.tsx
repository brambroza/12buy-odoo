import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/seo';

export const alt = `${SITE.name} — สั่งยางออนไลน์สำหรับดีลเลอร์`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social share card rendered at build time. */
export default async function OpenGraphImage() {
  const logo = await readFile(path.join(process.cwd(), 'public/brand/one2buy-256.png'));
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #fff7f7 0%, #ffe4e4 100%)', color: '#3a1212', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src={logoSrc} width={88} height={88} alt="" style={{ borderRadius: 18, background: '#ffffff' }} />
          <div style={{ display: 'flex', gap: 12, fontSize: 40, fontWeight: 800 }}><span>12buy</span><span style={{ color: '#8a5555', fontWeight: 500 }}>Dealer</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.1 }}>สั่งยางได้ใน 60 วินาที</div>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.1, color: '#d9342b' }}>จากมือถือของคุณ</div>
          <div style={{ fontSize: 30, color: '#8a5555', marginTop: 12 }}>ค้นหาด้วยขนาด เห็นราคาของร้านทันที สั่งซ้ำ 1 ปุ่ม แจ้งเตือนผ่าน LINE</div>
        </div>
        <div style={{ display: 'flex', gap: 28, fontSize: 26, color: '#6b3a3a' }}>
          <span>ยางรถยนต์</span><span>ยางรถบรรทุก</span><span>ยางมอเตอร์ไซค์</span><span>แบตเตอรี่</span><span>กระทะล้อ</span>
        </div>
      </div>
    ),
    size,
  );
}
