import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** App icon: the One2Buy mark from the 12buy Odoo website, on white for PWA launchers. */
export default async function Icon() {
  const logo = await readFile(path.join(process.cwd(), 'public/brand/one2buy-256.png'));
  const src = `data:image/png;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <img src={src} width={480} height={480} alt="" />
      </div>
    ),
    size,
  );
}
