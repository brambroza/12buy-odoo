/** Small typography helpers so both legal pages read the same. */
export function LegalTitle({ title, updated, lead }: { title: string; updated: string; lead: string }) {
  return (
    <header className="border-b border-[var(--lp-line)] pb-5">
      <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-[var(--lp-muted)]">ปรับปรุงล่าสุด {updated}</p>
      <p className="mt-3 text-sm leading-relaxed">{lead}</p>
    </header>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 space-y-2 text-sm leading-relaxed">
      <h2 className="text-base font-bold">{n}. {title}</h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return <ul className="list-disc space-y-1 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}
