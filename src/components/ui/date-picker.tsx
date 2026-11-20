'use client';

import * as React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BUDDHIST_YEAR_OFFSET,
  THAI_MONTHS_SHORT,
  THAI_WEEKDAYS_SHORT,
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  formatThaiDate,
  formatThaiDateLong,
  formatThaiMonth,
  isOutOfRange,
  monthGrid,
  monthOf,
  parseIsoDate,
  shiftMonth,
  toIsoDate,
  todayIso,
  type YearMonth,
} from '@/lib/date-picker';
import { cn } from '@/lib/utils';

export type DatePickerProps = {
  /** Form field name; the picked day is posted as ISO "YYYY-MM-DD" (same as the old `<input type="date">`). */
  name?: string;
  /** Initial ISO date for an uncontrolled picker. */
  defaultValue?: string | null;
  /** Controlled ISO date. Pair with `onValueChange`, or pass alone for a read-only display. */
  value?: string | null;
  /** Called with the new ISO date ("" when cleared). */
  onValueChange?: (value: string) => void;
  /** Earliest selectable ISO date (inclusive). */
  min?: string;
  /** Latest selectable ISO date (inclusive). */
  max?: string;
  required?: boolean;
  disabled?: boolean;
  /** Text shown while empty. */
  placeholder?: string;
  /** Layout classes for the field (width, height, margin). */
  className?: string;
  id?: string;
  form?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
};

/**
 * Thai calendar date picker that drops in for `<input type="date">` inside server-rendered forms.
 * Shows "20 พ.ย. 2569" (Buddhist year), opens a month grid with keyboard navigation, a month/year
 * jump view, and "วันนี้"/"ล้าง" shortcuts. A visually hidden input keeps native `required`
 * validation, `name` posting and form reset working.
 */
export function DatePicker({
  name,
  defaultValue,
  value: controlledValue,
  onValueChange,
  min,
  max,
  required,
  disabled,
  placeholder = 'เลือกวันที่',
  className,
  id,
  form,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: DatePickerProps) {
  const isControlled = controlledValue !== undefined;
  const [innerValue, setInnerValue] = React.useState(() => normalize(defaultValue));
  const value = isControlled ? normalize(controlledValue) : innerValue;

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'days' | 'months'>('days');
  const today = React.useMemo(() => todayIso(), []);
  const [focused, setFocused] = React.useState(() => clampIso(value || today, min, max));
  const [view, setView] = React.useState<YearMonth>(() => monthOf(focused, { year: new Date().getFullYear(), month: 0 }));

  const hiddenRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const focusOnRender = React.useRef(false);

  // Restore the default when the surrounding <form> is reset.
  React.useEffect(() => {
    const owner = hiddenRef.current?.form;
    if (!owner || isControlled) return;
    const onReset = () => setInnerValue(normalize(defaultValue));
    owner.addEventListener('reset', onReset);
    return () => owner.removeEventListener('reset', onReset);
  }, [defaultValue, isControlled]);

  // Move DOM focus to the active day after keyboard navigation re-renders the grid.
  React.useEffect(() => {
    if (!focusOnRender.current) return;
    focusOnRender.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focused}"]`)?.focus();
  });

  /** Commit a new value, notify the parent and fire a native change event for form listeners. */
  const commit = (next: string) => {
    if (!isControlled) setInnerValue(next);
    onValueChange?.(next);
    const input = hiddenRef.current;
    if (input) queueMicrotask(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  };

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    if (next) {
      const start = clampIso(value || today, min, max);
      setFocused(start);
      setView(monthOf(start, view));
      setMode('days');
    }
    setOpen(next);
  };

  const pick = (iso: string) => {
    if (isOutOfRange(iso, min, max)) return;
    commit(iso);
    setOpen(false);
  };

  /** Keyboard navigation inside the day grid (WAI-ARIA date picker pattern). */
  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -(parseIsoDate(focused)?.getUTCDay() ?? 0)),
      End: () => addDays(focused, 6 - (parseIsoDate(focused)?.getUTCDay() ?? 0)),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const next = clampIso(step(), min, max);
    setFocused(next);
    setView(monthOf(next, view));
    focusOnRender.current = true;
  };

  const goMonth = (delta: number) => {
    const nextView = shiftMonth(view, mode === 'months' ? delta * 12 : delta);
    setView(nextView);
    if (mode === 'days') setFocused(clampIso(addMonths(focused, nextView.year * 12 + nextView.month - (view.year * 12 + view.month)), min, max));
  };

  const minMonth = min ? monthOf(min, view) : null;
  const maxMonth = max ? monthOf(max, view) : null;
  const monthIndex = (m: YearMonth) => m.year * 12 + m.month;
  const prevDisabled = mode === 'days'
    ? Boolean(minMonth && monthIndex(view) <= monthIndex(minMonth))
    : Boolean(minMonth && view.year <= minMonth.year);
  const nextDisabled = mode === 'days'
    ? Boolean(maxMonth && monthIndex(view) >= monthIndex(maxMonth))
    : Boolean(maxMonth && view.year >= maxMonth.year);

  const selectedMonth = monthOf(value, { year: -1, month: 0 });
  const clearable = Boolean(value && !required && !disabled);
  const label = formatThaiDate(value);
  const todayDisabled = isOutOfRange(today, min, max);

  return (
    <span className={cn('relative inline-flex h-9 w-full min-w-0 align-middle', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          ref={triggerRef}
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel}: ${label ? formatThaiDateLong(value) : placeholder}` : undefined}
          aria-describedby={ariaDescribedBy}
          className={cn(
            'group/date flex size-full min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm font-normal text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none',
            'hover:border-primary/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 data-popup-open:border-primary data-popup-open:ring-3 data-popup-open:ring-primary/20',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none',
            'dark:bg-input/30',
            clearable && 'pr-7',
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/date:text-primary group-data-popup-open/date:text-primary" aria-hidden />
          <span className={cn('min-w-0 flex-1 truncate tabular-nums', !label && 'text-muted-foreground')}>{label || placeholder}</span>
        </PopoverTrigger>
        {clearable && (
          <button
            type="button"
            onClick={() => commit('')}
            aria-label="ล้างวันที่"
            className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
        <PopoverContent
          align="start"
          className="w-[18.5rem] gap-0 overflow-hidden p-0"
          initialFocus={() => gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]') ?? true}
          aria-label={ariaLabel ?? 'เลือกวันที่'}
        >
          {/* Header: month caption toggles the month/year view, arrows page through months (or years). */}
          <div className="flex items-center justify-between gap-1 border-b border-border bg-muted/40 px-2 py-2">
            <NavButton label={mode === 'days' ? 'เดือนก่อน' : 'ปีก่อน'} disabled={prevDisabled} onClick={() => goMonth(-1)}>
              <ChevronLeft className="size-4" />
            </NavButton>
            <button
              type="button"
              onClick={() => setMode(mode === 'days' ? 'months' : 'days')}
              aria-live="polite"
              className="rounded-md px-2.5 py-1 text-sm font-semibold transition hover:bg-background hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {mode === 'days' ? formatThaiMonth(view) : `พ.ศ. ${view.year + BUDDHIST_YEAR_OFFSET}`}
            </button>
            <NavButton label={mode === 'days' ? 'เดือนถัดไป' : 'ปีถัดไป'} disabled={nextDisabled} onClick={() => goMonth(1)}>
              <ChevronRight className="size-4" />
            </NavButton>
          </div>

          {mode === 'days' ? (
            <div className="p-2.5" ref={gridRef}>
              <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
                {THAI_WEEKDAYS_SHORT.map((d, i) => (
                  <span key={d} className={cn('py-1', i === 0 && 'text-primary/80')}>{d}</span>
                ))}
              </div>
              <div role="grid" aria-label={formatThaiMonth(view)} className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKeyDown}>
                {monthGrid(view).map((cell) => {
                  const selected = cell.iso === value;
                  const isToday = cell.iso === today;
                  const blocked = isOutOfRange(cell.iso, min, max);
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      role="gridcell"
                      data-iso={cell.iso}
                      tabIndex={cell.iso === focused ? 0 : -1}
                      disabled={blocked}
                      aria-selected={selected}
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={formatThaiDateLong(cell.iso)}
                      onClick={() => pick(cell.iso)}
                      onFocus={() => setFocused(cell.iso)}
                      className={cn(
                        'relative grid aspect-square place-items-center rounded-lg text-sm tabular-nums transition-colors outline-none',
                        'hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60',
                        !cell.inMonth && 'text-muted-foreground/45',
                        cell.inMonth && cell.weekday === 0 && !selected && 'text-primary/80',
                        isToday && !selected && 'font-semibold text-primary after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-primary',
                        selected && 'bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground',
                        blocked && 'cursor-not-allowed text-muted-foreground/30 line-through hover:bg-transparent hover:text-muted-foreground/30',
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 p-3">
              {THAI_MONTHS_SHORT.map((m, month) => {
                const target = { year: view.year, month };
                const blocked = Boolean((minMonth && monthIndex(target) < monthIndex(minMonth)) || (maxMonth && monthIndex(target) > monthIndex(maxMonth)));
                const current = monthIndex(target) === monthIndex(selectedMonth);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      setView(target);
                      const day = Math.min(parseIsoDate(focused)?.getUTCDate() ?? 1, daysInMonth(target));
                      setFocused(clampIso(toIsoDate(new Date(Date.UTC(target.year, month, day))), min, max));
                      setMode('days');
                    }}
                    className={cn(
                      'rounded-lg py-2.5 text-sm transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                      current && 'bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                      blocked && 'cursor-not-allowed text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40',
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2">
            <button
              type="button"
              disabled={todayDisabled}
              onClick={() => pick(today)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
            >
              วันนี้ · {formatThaiDate(today)}
            </button>
            {!required && value && (
              <button
                type="button"
                onClick={() => { commit(''); setOpen(false); }}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                ล้าง
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {/* Carries the ISO value for form posts and native `required` validation; the trigger is what users see. */}
      <input
        ref={hiddenRef}
        type="text"
        name={name}
        form={form}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={() => triggerRef.current?.focus()}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
      />
    </span>
  );
}

/** Square arrow button in the popup header. */
function NavButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-background hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Keep only valid ISO dates; anything else becomes "". */
function normalize(value: string | null | undefined): string {
  return value && parseIsoDate(value) ? value.trim() : '';
}
