'use client';

import { useActionState, useState } from 'react';
import { Minus, Plus, ShoppingCart, Check } from 'lucide-react';
import { addToCartAction, type ActionResult } from '@/app/shop/actions';
import { Button } from '@/components/ui/button';

export type UnitOption = { id: number; name: string; factor: number };

/**
 * Quantity stepper + optional unit picker (เส้น / มัด 3 เส้น / …) + add button.
 * `onChange` lets the product page show the price for the selected unit.
 * `soldOut` replaces the form with a disabled button (the server also refuses out-of-stock adds).
 */
export function AddToCart({ productId, defaultQty, units = [], compact = false, soldOut = false, onChange }: { productId: number; defaultQty: number; units?: UnitOption[]; compact?: boolean; soldOut?: boolean; onChange?: (unit: UnitOption, qty: number) => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addToCartAction, null);
  const [unitId, setUnitId] = useState<number | undefined>(units[0]?.id);
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const [qty, setQtyState] = useState(defaultQty);
  const hasPacks = units.some((u) => u.factor > 1);
  const setQty = (n: number) => { const v = Math.max(1, Math.min(999, n || 1)); setQtyState(v); if (unit) onChange?.(unit, v); };
  const pickUnit = (id: number) => { setUnitId(id); const u = units.find((x) => x.id === id); if (u) { const v = u.factor > 1 ? 1 : defaultQty; setQtyState(v); onChange?.(u, v); } };
  if (soldOut) return <Button type="button" variant="secondary" disabled className={compact ? 'h-11' : 'h-11 w-full'}>สินค้าหมด</Button>;
  return (
    <form action={action} className={compact ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-3'}>
      <input type="hidden" name="productId" value={productId} />
      {unit && <input type="hidden" name="unitId" value={unit.id} />}
      <div className="flex items-center rounded-lg border border-border">
        <button type="button" aria-label="ลดจำนวน" onClick={() => setQty(qty - 1)} className="flex size-11 items-center justify-center text-muted-foreground"><Minus className="size-4" /></button>
        <input name="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-12 bg-transparent text-center text-base font-semibold outline-none" aria-label="จำนวน" />
        <button type="button" aria-label="เพิ่มจำนวน" onClick={() => setQty(qty + 1)} className="flex size-11 items-center justify-center text-muted-foreground"><Plus className="size-4" /></button>
      </div>
      {hasPacks && (
        <select aria-label="หน่วย" value={unitId} onChange={(e) => pickUnit(Number(e.target.value))} className={`rounded-lg border border-border bg-background px-2 text-sm h-11`}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
      <Button type="submit" disabled={pending} className={compact ? 'h-11' : 'h-11 flex-1'}>
        {state?.ok ? <Check className="size-4" /> : <ShoppingCart className="size-4" />}
        {pending ? 'กำลังใส่...' : state?.ok ? 'ใส่แล้ว' : 'ใส่ตะกร้า'}
      </Button>
      {unit && unit.factor > 1 && <span className="w-full text-xs text-muted-foreground">= {qty * unit.factor} เส้น</span>}
      {state && !state.ok && <span className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
