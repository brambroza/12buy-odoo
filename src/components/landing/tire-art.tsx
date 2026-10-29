/** Decorative tire illustration (pure SVG, no network) used in the hero. */
export function TireArt({ className = '' }: { className?: string }) {
  const treads = Array.from({ length: 36 }, (_, i) => i * 10);
  const spokes = Array.from({ length: 5 }, (_, i) => i * 72);
  return (
    <svg viewBox="0 0 320 320" className={className} aria-hidden="true" data-tire>
      <defs>
        <radialGradient id="tire-rubber" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="oklch(0.22 0.01 260)" />
          <stop offset="100%" stopColor="oklch(0.12 0.01 260)" />
        </radialGradient>
        <linearGradient id="tire-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.95 0.008 20)" />
          <stop offset="50%" stopColor="oklch(0.76 0.012 20)" />
          <stop offset="100%" stopColor="oklch(0.9 0.01 20)" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="156" fill="url(#tire-rubber)" />
      {treads.map((deg) => (
        <rect key={deg} x="156" y="6" width="8" height="26" rx="3" fill="oklch(0.09 0.01 260)" transform={`rotate(${deg} 160 160)`} />
      ))}
      <circle cx="160" cy="160" r="122" fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth="2" strokeDasharray="6 10" />
      <circle cx="160" cy="160" r="104" fill="url(#tire-rim)" />
      <circle cx="160" cy="160" r="96" fill="oklch(0.2 0.01 260)" />
      {spokes.map((deg) => (
        <path key={deg} d="M160 160 L140 80 Q160 70 180 80 Z" fill="url(#tire-rim)" transform={`rotate(${deg} 160 160)`} />
      ))}
      <circle cx="160" cy="160" r="30" fill="url(#tire-rim)" />
      <circle cx="160" cy="160" r="16" fill="var(--lp-accent)" />
      {spokes.map((deg) => (
        <circle key={`nut-${deg}`} cx="160" cy="136" r="4" fill="oklch(0.3 0.01 260)" transform={`rotate(${deg + 36} 160 160)`} />
      ))}
    </svg>
  );
}
