'use client';

import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Search } from 'lucide-react';
import { normalizeSizeQuery } from '@/lib/shop/size';

type DemoRow = { brand: string; model: string; size: string; price: number; stock: 'มี' | 'เหลือน้อย' | 'สั่งจอง' };

/** Static sample rows so the demo never calls Odoo. */
const SAMPLE: DemoRow[] = [
  { brand: 'ยี่ห้อ A', model: 'Touring', size: '195/65R15', price: 1890, stock: 'มี' },
  { brand: 'ยี่ห้อ B', model: 'Eco Plus', size: '195/65R15', price: 2150, stock: 'มี' },
  { brand: 'ยี่ห้อ C', model: 'Sport', size: '195/65R15', price: 2490, stock: 'เหลือน้อย' },
  { brand: 'ยี่ห้อ A', model: 'Radial', size: '11R22.5', price: 7900, stock: 'มี' },
  { brand: 'ยี่ห้อ D', model: 'Mixed', size: '11R22.5', price: 8450, stock: 'สั่งจอง' },
  { brand: 'ยี่ห้อ E', model: 'City', size: '90/90-17', price: 690, stock: 'มี' },
  { brand: 'ยี่ห้อ F', model: 'Grip', size: '90/90-17', price: 790, stock: 'มี' },
];

const CHIPS = ['195/65R15', '11R22.5', '90/90-17'];

/**
 * Interactive "type a size, see your price" demo for the landing page.
 * Reuses the real size normaliser so `1956515` and `195 65 15` both match.
 */
export function SizeDemo() {
  const [query, setQuery] = useState('195/65R15');
  const listRef = useRef<HTMLUListElement>(null);
  const normalized = normalizeSizeQuery(query);
  const digits = normalized && 'digits' in normalized ? normalized.digits : '';
  const rows = digits ? SAMPLE.filter((row) => row.size.replace(/\D/g, '').startsWith(digits)) : [];

  useGSAP(
    () => {
      if (!listRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap.fromTo(listRef.current.children, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out', overwrite: true });
    },
    { dependencies: [digits], scope: listRef },
  );

  return (
    <div className="rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg-2)] p-4 shadow-2xl shadow-black/40">
      <label className="flex items-center gap-2 rounded-xl border border-[var(--lp-line)] bg-[var(--lp-bg)] px-3 py-2.5 focus-within:border-[var(--lp-accent)]">
        <Search className="size-4 text-[var(--lp-muted)]" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputMode="numeric"
          placeholder="พิมพ์ขนาด เช่น 195/65R15"
          aria-label="ทดลองค้นหาขนาดยาง"
          className="w-full bg-transparent text-base outline-none placeholder:text-[var(--lp-muted)]"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setQuery(chip)}
            className="rounded-full border border-[var(--lp-line)] px-3 py-1 text-xs text-[var(--lp-muted)] transition hover:border-[var(--lp-accent)] hover:text-[var(--lp-fg)]"
          >
            {chip}
          </button>
        ))}
      </div>
      <ul ref={listRef} className="mt-4 space-y-2" aria-live="polite">
        {rows.length === 0 && <li className="rounded-xl border border-dashed border-[var(--lp-line)] p-4 text-center text-sm text-[var(--lp-muted)]">ลองพิมพ์ขนาดจากตัวอย่างด้านบน</li>}
        {rows.map((row) => (
          <li key={`${row.brand}-${row.model}-${row.size}`} className="flex items-center justify-between rounded-xl bg-[var(--lp-bg)] px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold">
                {row.brand} <span className="font-normal text-[var(--lp-muted)]">{row.model}</span>
              </p>
              <p className="text-xs text-[var(--lp-muted)]">{row.size}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-[var(--lp-accent)]">฿{row.price.toLocaleString('th-TH')}</p>
              <p className={`text-[11px] ${row.stock === 'มี' ? 'text-emerald-600' : row.stock === 'เหลือน้อย' ? 'text-amber-600' : 'text-[var(--lp-muted)]'}`}>{row.stock}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[11px] text-[var(--lp-muted)]">ราคาตัวอย่างเท่านั้น ราคาจริงแสดงตามสิทธิ์ของร้านหลังเข้าสู่ระบบ</p>
    </div>
  );
}
