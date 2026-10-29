'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Search, Tag } from 'lucide-react';
import { partValues, sizeQuery, type SizeOption } from '@/lib/shop/size-options';
import { DEALER_TYPE_LABELS, type DealerType } from '@/lib/shop/types';

type Tab = 'size' | 'brand';
const TYRE_TYPES: DealerType[] = ['CAR', 'TRUCK', 'MOTORCYCLE'];
const ALL_TYPES = Object.keys(DEALER_TYPE_LABELS) as DealerType[];

export type BrandOption = { brand: string; name: string; count: number };

/**
 * Dark search console under the hero, modelled on retail tyre sites: tabs for
 * "by size" (cascading width / series / rim dropdowns) and "by brand", a family
 * radio row, and a free-text fallback. Options come from the live catalog.
 */
export function SearchPanel({ sizes, brands }: { sizes: SizeOption[]; brands: BrandOption[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('size');
  const [type, setType] = useState<DealerType | undefined>(undefined);
  const [width, setWidth] = useState('');
  const [aspect, setAspect] = useState<string | null | undefined>(undefined);
  const [rim, setRim] = useState('');
  const [text, setText] = useState('');
  const [brand, setBrand] = useState('');
  const [brandType, setBrandType] = useState<DealerType | ''>('');

  const widths = useMemo(() => partValues(sizes, 'width', { type }) as string[], [sizes, type]);
  const aspects = useMemo(() => (width ? partValues(sizes, 'aspect', { type, width }) : []), [sizes, type, width]);
  const rims = useMemo(() => (width && aspect !== undefined ? (partValues(sizes, 'rim', { type, width, aspect }) as string[]) : []), [sizes, type, width, aspect]);
  const hasOptions = sizes.length > 0;

  const pickType = (next: DealerType | undefined) => { setType(next); setWidth(''); setAspect(undefined); setRim(''); };
  const pickWidth = (v: string) => { setWidth(v); setRim(''); const a = v ? partValues(sizes, 'aspect', { type, width: v }) : []; setAspect(a.length === 1 ? a[0] : undefined); };
  const pickAspect = (v: string) => { setAspect(v === '__none' ? null : v || undefined); setRim(''); };

  const submitSize = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim() || sizeQuery({ width: width || undefined, aspect, rim: rim || undefined }, sizes);
    if (!q) return;
    const sp = new URLSearchParams({ q });
    if (type) sp.set('type', type);
    router.push(`/tires/search?${sp.toString()}`);
  };
  const submitBrand = (e: React.FormEvent) => {
    e.preventDefault();
    if (brand) router.push(`/tires/brand/${encodeURIComponent(brand.toLowerCase())}${brandType ? `?type=${brandType}` : ''}`);
    else router.push(brandType ? `/tires?type=${brandType}` : '/tires');
  };

  const select = 'h-12 w-full appearance-none rounded-xl border border-white/15 bg-white/10 px-4 pr-10 text-sm font-semibold text-white outline-none transition focus:border-[var(--lp-accent)] focus:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 [&>option]:text-black';

  return (
    <section id="search" className="scroll-mt-28 bg-[oklch(0.22_0.03_25)] text-white" aria-label="ค้นหาสินค้า">
      <div className="mx-auto max-w-5xl px-4 pb-6 pt-2">
        <div role="tablist" aria-label="วิธีค้นหา" className="flex gap-6 border-b border-white/15">
          {([['size', 'ค้นหายางตามขนาด', Search], ['brand', 'ค้นหาตามแบรนด์', Tag]] as const).map(([id, label, Icon]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`-mb-px inline-flex items-center gap-2 border-b-[3px] px-1 py-3 text-sm font-bold transition sm:text-base ${tab === id ? 'border-[var(--lp-accent)] text-white' : 'border-transparent text-white/60 hover:text-white'}`}>
              <Icon className="size-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {tab === 'size' ? (
          <form onSubmit={submitSize} className="mt-5 space-y-4" role="search">
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <legend className="sr-only">ประเภทยาง</legend>
              <Radio name="type" checked={!type} onChange={() => pickType(undefined)} label="ยางทั้งหมด" />
              {TYRE_TYPES.map((t) => <Radio key={t} name="type" checked={type === t} onChange={() => pickType(t)} label={DEALER_TYPE_LABELS[t]} />)}
            </fieldset>

            {hasOptions ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
                <Field label="หน้ากว้างยาง" hint="01">
                  <select aria-label="หน้ากว้างยาง" value={width} onChange={(e) => pickWidth(e.target.value)} className={select}>
                    <option value="">เลือกหน้ากว้าง</option>
                    {widths.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </Field>
                <Field label="ซีรีส์ (แก้มยาง)" hint="02">
                  <select aria-label="ซีรีส์" value={aspect === undefined ? '' : aspect === null ? '__none' : aspect} onChange={(e) => pickAspect(e.target.value)} disabled={!width} className={select}>
                    <option value="">เลือกซีรีส์</option>
                    {aspects.map((a) => <option key={a ?? '__none'} value={a ?? '__none'}>{a ?? 'ไม่มีซีรีส์ (เช่น 11R22.5)'}</option>)}
                  </select>
                </Field>
                <Field label="ขอบล้อ" hint="03">
                  <select aria-label="ขอบล้อ" value={rim} onChange={(e) => setRim(e.target.value)} disabled={aspect === undefined} className={select}>
                    <option value="">เลือกขอบล้อ</option>
                    {rims.map((r) => <option key={r} value={r}>R{r}</option>)}
                  </select>
                </Field>
                <div className="flex items-end">
                  <button type="submit" disabled={!width && !text.trim()} className="h-12 w-full rounded-xl bg-[var(--lp-accent)] px-8 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-40 lg:w-auto">ค้นหา</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/60">กำลังโหลดรายการขนาด พิมพ์ขนาดด้านล่างได้เลย</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs text-white/60">หรือพิมพ์ขนาดเอง</span>
              <div className="flex flex-1 items-center gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} inputMode="search" enterKeyHint="search" placeholder="เช่น 195/65R15 หรือ 1956515" aria-label="พิมพ์ขนาดยาง"
                  className="h-10 w-full max-w-xs rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[var(--lp-accent)]" />
                {!hasOptions && <button type="submit" className="h-10 rounded-lg bg-[var(--lp-accent)] px-5 text-sm font-bold text-white">ค้นหา</button>}
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={submitBrand} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]" role="search">
            <Field label="แบรนด์">
              <select aria-label="แบรนด์" value={brand} onChange={(e) => setBrand(e.target.value)} className={select}>
                <option value="">ทุกแบรนด์</option>
                {brands.map((b) => <option key={b.brand} value={b.brand}>{b.name} ({b.count})</option>)}
              </select>
            </Field>
            <Field label="หมวดสินค้า">
              <select aria-label="หมวดสินค้า" value={brandType} onChange={(e) => setBrandType(e.target.value as DealerType | '')} className={select}>
                <option value="">ทุกหมวด</option>
                {ALL_TYPES.map((t) => <option key={t} value={t}>{DEALER_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <div className="flex items-end">
              <button type="submit" className="h-12 w-full rounded-xl bg-[var(--lp-accent)] px-8 text-base font-bold text-white transition hover:brightness-110 lg:w-auto">ค้นหา</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Radio({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 font-semibold">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4 accent-[var(--lp-accent)]" /> {label}
    </label>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-white/70">
        {hint && <span className="flex size-5 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">{hint}</span>} {label}
      </span>
      <span className="relative block">
        {children}
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/60" aria-hidden="true" />
      </span>
    </label>
  );
}
