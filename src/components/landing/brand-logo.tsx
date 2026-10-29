import Image from 'next/image';

/** The One2Buy cart mark used across public pages. */
export function BrandLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <Image src="/brand/one2buy-256.png" alt="" width={size} height={size} priority className={`rounded-lg ${className}`} />;
}
