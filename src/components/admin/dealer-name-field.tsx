'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Store, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A shop that already exists: a web dealer (open it) or an Odoo customer without a web account (create from it). */
export type ExistingShop = { kind: 'dealer' | 'odoo'; name: string; detail: string; href: string };

const MAX_SUGGESTIONS = 8;

/** Case-insensitive "contains" on collapsed whitespace, so `ร้าน  ยาง` still finds `ร้านยางสมชาย`. */
function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/**
 * Shop name input of the "add dealer" form with autocomplete over shops we already know, so the admin
 * sees a duplicate before saving. Picking a web dealer opens that dealer instead of creating a second
 * one; picking an Odoo customer restarts the form prefilled from it. Typing a name nobody has works as a
 * plain input. Pure client filtering: the list is small (a few hundred shops) and already loaded.
 */
export function DealerNameField({ existing, defaultValue, className }: { existing: ExistingShop[]; defaultValue?: string; className?: string }) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const query = norm(value);
  const matches = useMemo(() => (query.length < 2 ? [] : existing.filter((s) => norm(s.name).includes(query)).slice(0, MAX_SUGGESTIONS)), [existing, query]);
  const exact = query.length >= 2 ? existing.find((s) => norm(s.name) === query) : undefined;
  const showList = open && matches.length > 0;

  return (
    <div className="relative">
      <input
        name="name"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // Delay so a click on a suggestion lands before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        required
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={exact ? true : undefined}
        className={className}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-md">
          <li className="px-2 py-1 text-[11px] text-muted-foreground">ร้านที่มีอยู่แล้ว · กดเพื่อเปิดแทนการสร้างซ้ำ</li>
          {matches.map((s) => (
            <li key={`${s.kind}-${s.href}`} role="option" aria-selected={false}>
              <Link href={s.href} scroll={false} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus:bg-accent focus:outline-none">
                {s.kind === 'dealer' ? <Store className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> : <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.kind === 'dealer' ? 'ดีลเลอร์บนเว็บ' : 'ลูกค้า Odoo ยังไม่มีบัญชีเว็บ'}{s.detail ? ` · ${s.detail}` : ''}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {exact && (
        <p className={cn('mt-1 text-[11px]', exact.kind === 'dealer' ? 'text-destructive' : 'text-amber-700')}>
          {exact.kind === 'dealer' ? 'มีดีลเลอร์ชื่อนี้อยู่แล้ว ' : 'ชื่อนี้เป็นลูกค้า Odoo อยู่แล้ว '}
          <Link href={exact.href} scroll={false} className="underline">{exact.kind === 'dealer' ? 'เปิดร้านเดิม' : 'สร้างจากลูกค้า Odoo รายนี้'}</Link>
        </p>
      )}
    </div>
  );
}
