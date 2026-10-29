'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Entity = { id: number };

type OdooEntityPickerProps<T extends Entity> = {
  endpoint: string;
  value: T | null;
  onSelect: (item: T) => void;
  placeholder: string;
  emptyLabel?: string;
  renderLabel: (item: T) => string;
  renderSub?: (item: T) => string;
};

export function OdooEntityPicker<T extends Entity>({
  endpoint,
  value,
  onSelect,
  placeholder,
  emptyLabel = 'ไม่พบข้อมูลใน Odoo — ลองสร้างและ Sync ก่อน',
  renderLabel,
  renderSub,
}: OdooEntityPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`${endpoint}?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((json) => { if (!cancelled) setResults(json.data ?? []); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, open, endpoint]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value ? renderLabel(value) : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> กำลังค้นหาใน Odoo...
              </div>
            ) : (
              <CommandEmpty>{emptyLabel}</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((item) => (
                <CommandItem
                  key={item.id}
                  value={String(item.id)}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('size-4', value?.id === item.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex flex-col">
                    <span>{renderLabel(item)}</span>
                    {renderSub && <span className="text-xs text-muted-foreground">{renderSub(item)}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
