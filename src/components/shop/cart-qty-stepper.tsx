'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { announceRemoved } from '@/components/shop/cart-undo';

const MAX_QTY = 999;
/** Wait this long after the last tap before saving, so tapping + five times sends one request. */
const SAVE_DELAY_MS = 400;

type UnitOption = { id: number; name: string; factor: number };

/** "มัด" → "มัด (10 เส้น)"; names that already state a count ("มัด 10 เส้น") stay as they are. */
function unitOptionLabel(unit: UnitOption, baseUnit: string): string {
  if (unit.factor <= 1 || /\d/.test(unit.name)) return unit.name;
  return `${unit.name} (${unit.factor} ${baseUnit})`;
}

/**
 * − / + stepper for one cart line. Saves automatically through `action` (posts productId, unitId, qty in sale units).
 * When the product has several units, a picker switches the line through `changeUnit` (posts productId, fromUnitId, toUnitId).
 * + stops at the stock on hand (`stock`, base units). "ลบ" announces the line so the undo toast can restore it.
 * The parent should key this by the saved unit + qty so a fresh server value resets the local state.
 */
export function CartQtyStepper({ productId, unitId, qty, baseUnit, units, stock, index, label, action, changeUnit }: {
  productId: number; unitId: number | null; qty: number; baseUnit: string; units: UnitOption[]; stock: number; index: number; label: string;
  action: (formData: FormData) => Promise<void>; changeUnit: (formData: FormData) => Promise<void>;
}) {
  const [value, setValue] = useState(qty);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Base-unit lines are stored with unitId null; the picker shows the base unit (factor 1) for them.
  const selectedUnit = units.find((u) => (unitId == null ? u.factor === 1 : u.id === unitId)) ?? units[0];
  const factor = selectedUnit?.factor ?? 1;
  const maxQty = Math.min(MAX_QTY, Math.max(1, Math.floor(stock / factor)));

  const save = (next: number) => {
    const formData = new FormData();
    formData.set('productId', String(productId));
    if (unitId != null) formData.set('unitId', String(unitId));
    formData.set('qty', String(next));
    startTransition(() => action(formData));
  };

  const change = (next: number, immediate = false) => {
    const clamped = Math.max(1, Math.min(MAX_QTY, Math.round(next) || 1));
    setValue(clamped);
    if (timer.current) clearTimeout(timer.current);
    if (clamped === qty) return;
    if (immediate) save(clamped);
    else timer.current = setTimeout(() => save(clamped), SAVE_DELAY_MS);
  };

  const switchUnit = (toUnitId: number) => {
    if (timer.current) clearTimeout(timer.current);
    const formData = new FormData();
    formData.set('productId', String(productId));
    if (unitId != null) formData.set('fromUnitId', String(unitId));
    formData.set('toUnitId', String(toUnitId));
    startTransition(() => changeUnit(formData));
  };

  const remove = () => {
    if (timer.current) clearTimeout(timer.current);
    announceRemoved({ productId, qty: qty * factor, unitId, unitQty: unitId != null ? qty : null, index, label });
    save(0);
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex items-center rounded-lg border border-border">
        <button type="button" aria-label="ลดจำนวน" onClick={() => change(value - 1)} disabled={value <= 1} className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
          <Minus className="size-4" />
        </button>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(Number(e.target.value.replace(/\D/g, '')) || 0)}
          onBlur={() => change(value, true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); change(value, true); } }}
          className="h-9 w-12 bg-transparent text-center text-sm font-semibold outline-none"
          aria-label="จำนวน"
        />
        <button type="button" aria-label="เพิ่มจำนวน" onClick={() => change(value + 1)} disabled={value >= maxQty} className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
          <Plus className="size-4" />
        </button>
      </div>
      {units.length > 1 ? (
        <select aria-label="หน่วย" value={selectedUnit?.id} onChange={(e) => switchUnit(Number(e.target.value))} disabled={pending} className="h-9 min-w-0 max-w-[11rem] rounded-lg border border-border bg-background px-2 text-sm">
          {units.map((u) => <option key={u.id} value={u.id}>{unitOptionLabel(u, baseUnit)}</option>)}
        </select>
      ) : (
        <span className="text-xs text-muted-foreground">{baseUnit}</span>
      )}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="กำลังบันทึก" />}
      <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending} className="ml-auto text-muted-foreground"><Trash2 className="size-4" /> ลบ</Button>
    </div>
  );
}
