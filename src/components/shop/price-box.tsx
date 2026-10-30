'use client';

import { useState } from 'react';
import { AddToCart, type UnitOption } from './add-to-cart';
import { baht } from '@/lib/shop/catalog';

/**
 * Price + add-to-cart block on the product page; re-computes the total for the chosen unit and quantity.
 * `cashNote` (credit dealers) tells what paying cash takes off.
 */
export function PriceBox({ productId, unitPrice, baseUnit, units, defaultQty, stock, soldOut = false, vatNote = '', cashNote = '' }: { productId: number; unitPrice: number; baseUnit: string; units: UnitOption[]; defaultQty: number; stock: React.ReactNode; soldOut?: boolean; vatNote?: string; cashNote?: string }) {
  const [sel, setSel] = useState<{ unit: UnitOption; qty: number }>({ unit: units[0], qty: defaultQty });
  const baseQty = sel.qty * (sel.unit?.factor ?? 1);
  const packPrice = unitPrice * (sel.unit?.factor ?? 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">ราคาของร้านคุณ</p>
          <p className="text-3xl font-black">{baht(unitPrice)} <span className="text-sm font-normal text-muted-foreground">/{baseUnit}{vatNote && ` · ${vatNote}`}</span></p>
          {sel.unit && sel.unit.factor > 1 && <p className="text-sm font-semibold">{baht(packPrice)} /{sel.unit.name}</p>}
          <p className="text-xs text-muted-foreground">{sel.unit && sel.unit.factor > 1 ? `${sel.qty} ${sel.unit.name} = ${baseQty} ${baseUnit} = ` : `${baseQty} ${baseUnit} = `}{baht(unitPrice * baseQty)}</p>
          {cashNote && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{cashNote}</p>}
        </div>
        {stock}
      </div>
      <div className="mt-4">
        <AddToCart productId={productId} defaultQty={defaultQty} units={units} soldOut={soldOut} onChange={(unit, qty) => setSel({ unit, qty })} />
      </div>
    </div>
  );
}
