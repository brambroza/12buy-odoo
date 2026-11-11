import { NextResponse } from 'next/server';
import { readLandingImage } from '@/lib/shop/uploads';

/**
 * Public landing artwork uploaded from `/admin/landing`. File names are validated in
 * `readLandingImage`; each upload gets a new name, so responses can be cached for a long time.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const image = await readLandingImage(name);
  if (!image) return new NextResponse('not found', { status: 404 });
  return new NextResponse(new Uint8Array(image.body), { headers: { 'Content-Type': image.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
