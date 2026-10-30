import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

/** Maskable launcher icon: brand mark inside the 80% safe zone on the brand red, for Android adaptive icons. */
export async function GET() {
  const logo = await readFile(path.join(process.cwd(), 'public/brand/one2buy-256.png'));
  const src = `data:image/png;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders to PNG */}
        <img src={src} width={360} height={360} alt="" style={{ borderRadius: 48 }} />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
