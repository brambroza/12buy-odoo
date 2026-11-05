'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Building2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One Odoo customer the dealer may be linked to. `linkedTo` names the web dealer already using it. */
export type OdooPartnerOption = { id: number; name: string; detail: string; linkedTo?: { dealerId: string; name: string } };

const MAX_SUGGESTIONS = 30;

/** Case-insensitive "contains" on collapsed whitespace, so `ร้าน  ยาง` still finds `ร้านยางสมชาย`. */
function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/**
 * "ลูกค้าใน Odoo" picker of the dealer form: type to search Odoo customers by name, province, pricelist,
 * phone or id, then pick one. Customers already linked to another web dealer are flagged. Submits `odooPartnerId` (blank = not linked) through a hidden input.
 * Pure client filtering over the already loaded list.
 */
export function OdooPartnerField({ options, defaultValue, dealerId, className }: { options: OdooPartnerOption[]; defaultValue?: number | null; dealerId?: string; className?: string }) {
  const initial = defaultValue ? options.find((o) => o.id === defaultValue) ?? { id: defaultValue, name: `Odoo #${defaultValue}`, detail: '' } : null;
  const [selected, setSelected] = useState<OdooPartnerOption | null>(initial);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = norm(query);
    const found = q ? options.filter((o) => norm(`${o.name} ${o.detail} ${o.id}`).includes(q)) : options;
    return found.slice(0, MAX_SUGGESTIONS);
  }, [options, query]);

  const pick = (option: OdooPartnerOption | null) => {
    setSelected(option);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (matches[active]) pick(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative">
      <input type="hidden" name="odooPartnerId" value={selected?.id ?? ''} />
      <div className="relative">
        <input
          ref={inputRef}
          value={open ? query : selected ? selected.name : ''}
          placeholder={selected ? selected.name : 'ไม่ผูก · พิมพ์ชื่อร้าน จังหวัด เบอร์ หรือเลข Odoo เพื่อค้นหา'}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => { setQuery(''); setOpen(true); setActive(0); }}
          // Delay so a click on a suggestion lands before the list unmounts.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className={cn(className, 'pr-8')}
        />
        {selected && (
          <button type="button" aria-label="ยกเลิกการผูก Odoo" onClick={() => { pick(null); inputRef.current?.focus(); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {selected && !open && (
        <span className="mt-1 block text-[11px] font-normal text-muted-foreground">Odoo #{selected.id}{selected.detail ? ` · ${selected.detail}` : ''}</span>
      )}
      {open && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm font-normal shadow-md">
          {matches.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">ไม่พบลูกค้าใน Odoo ที่ตรงกับ “{query}”</li>}
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={selected?.id === o.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
                className={cn('flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left', i === active && 'bg-accent', selected?.id === o.id && 'font-semibold')}>
                <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate">{o.name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">#{o.id}{o.detail ? ` · ${o.detail}` : ''}</span>
                  {o.linkedTo && o.linkedTo.dealerId !== dealerId && <span className="block truncate text-xs font-normal text-amber-700">ผูกกับร้าน {o.linkedTo.name} แล้ว</span>}
                </span>
              </button>
            </li>
          ))}
          {matches.length === MAX_SUGGESTIONS && <li className="px-2 py-1 text-[11px] text-muted-foreground">แสดง {MAX_SUGGESTIONS} รายการแรก · พิมพ์เพิ่มเพื่อกรอง</li>}
        </ul>
      )}
    </div>
  );
}
