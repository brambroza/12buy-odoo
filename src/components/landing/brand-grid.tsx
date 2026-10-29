import Image from 'next/image';
import Link from 'next/link';
import type { Brand } from '@/lib/landing-content';

/**
 * Brand wall. Renders a logo tile when licensed artwork exists, otherwise a
 * text tile, so the section never shows broken images while assets are pending.
 */
export function BrandGrid({ brands }: { brands: readonly Brand[] }) {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {brands.map((brand, i) => (
        <li key={brand.name} data-reveal={(i % 5) * 0.04}>
          <Tile brand={brand} />
        </li>
      ))}
    </ul>
  );
}

/** Logo or name tile; links to the brand's catalog page when a code is known. */
function Tile({ brand }: { brand: Brand }) {
  const cls = 'flex h-20 items-center justify-center rounded-2xl border border-[var(--lp-line)] bg-white px-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--lp-accent)] hover:shadow-md';
  const inner = brand.logo ? (
    <Image src={brand.logo} alt={brand.name} width={200} height={80} className="h-auto max-h-12 w-auto max-w-[140px] object-contain" />
  ) : (
    <span className="text-center text-sm font-bold tracking-tight">{brand.name}</span>
  );
  return brand.code ? <Link href={`/tires/brand/${brand.code.toLowerCase()}`} className={cls} aria-label={`ดูสินค้า ${brand.name}`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
