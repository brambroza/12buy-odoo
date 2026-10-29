import { ChevronDown } from 'lucide-react';

/** Native `<details>` accordion styled for the landing theme. No JS needed. */
export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="mt-6 divide-y divide-[var(--lp-line)] overflow-hidden rounded-2xl border border-[var(--lp-line)] bg-white">
      {items.map((item, i) => (
        <details key={item.q} data-reveal={i * 0.04} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="size-5 shrink-0 text-[var(--lp-muted)] transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--lp-muted)]">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
