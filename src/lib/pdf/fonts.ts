import path from 'node:path';
import { Font } from '@react-pdf/renderer';

let registered = false;

/** Registers Sarabun (Thai, OFL) from `public/fonts` once per process so every PDF renders Thai correctly. */
export function ensurePdfFonts(): void {
  if (registered) return;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  Font.register({
    family: 'Sarabun',
    fonts: [
      { src: path.join(dir, 'Sarabun-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'Sarabun-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Thai has no spaces between words; let the engine break anywhere instead of hyphenating.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
