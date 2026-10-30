'use client';

import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { caretAfterFormat, formatMoneyText, moneyTextFrom, parseMoneyText, plainMoneyText, significantBeforeCaret } from '@/lib/money';

type MoneyInputProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'inputMode'> & {
  /** Starting amount for an uncontrolled field (form posts). */
  defaultValue?: number | string | null;
  /** Amount for a controlled field; pair with `onValueChange`. */
  value?: number | null;
  /** Called with the typed amount (null when blank) on every edit. */
  onValueChange?: (value: number | null) => void;
  /** Decimal places allowed; 0 for whole baht. */
  decimals?: number;
  /** Drops the shared input look so a caller's `className` styles it alone. */
  unstyled?: boolean;
};

const BASE = 'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30';

/**
 * Baht amount field that shows thousands commas while typing ("1,250,000.50"). The visible box has no
 * `name`; a hidden input carries the plain number ("1250000.50") under `name`, so server actions and
 * parsers read the same value they did from a plain number field.
 */
export function MoneyInput({ name, defaultValue, value, onValueChange, decimals = 2, unstyled, className, ...props }: MoneyInputProps) {
  const [text, setText] = useState(() => moneyTextFrom(value !== undefined ? value : defaultValue, decimals));
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  // A controlled value changed from outside (form reset, picked product): show it unless it is what is typed.
  // Blank and 0 count as the same, so clearing the box to retype does not snap back to "0".
  if (value !== undefined && (parseMoneyText(text) ?? 0) !== (value ?? 0)) {
    setText(moneyTextFrom(value, decimals));
  }

  useLayoutEffect(() => {
    if (caret.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  return (
    <>
      <input
        {...props}
        ref={inputRef}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          const formatted = formatMoneyText(raw, decimals);
          caret.current = caretAfterFormat(formatted, significantBeforeCaret(raw, e.target.selectionStart ?? raw.length));
          setText(formatted);
          onValueChange?.(parseMoneyText(formatted));
        }}
        className={unstyled ? className : cn(BASE, className)}
      />
      {name && <input type="hidden" name={name} value={plainMoneyText(text)} disabled={props.disabled} />}
    </>
  );
}
