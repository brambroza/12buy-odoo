import { Check, Circle } from 'lucide-react';
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, type ProtoOrder } from '@/lib/shop/types';
import { cn } from '@/lib/utils';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Compact date for the horizontal stepper, e.g. `28 ต.ค. 13:05`. */
function fmtShort(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Horizontal stepper for phones: five dots on one line, labels underneath, current step ringed. */
function OrderStepper({ order, currentIndex }: { order: ProtoOrder; currentIndex: number }) {
  const current = ORDER_STATUS_FLOW[currentIndex];
  const currentEvent = order.events.find((e) => e.status === current);
  return (
    <div className="space-y-3">
      <ol className="flex">
        {ORDER_STATUS_FLOW.map((status, index) => {
          const done = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const event = order.events.find((e) => e.status === status);
          return (
            <li key={status} className="relative flex flex-1 flex-col items-center text-center" aria-current={isCurrent ? 'step' : undefined}>
              {index < ORDER_STATUS_FLOW.length - 1 && (
                <span aria-hidden className={cn('absolute left-1/2 top-3.5 h-0.5 w-full', index < currentIndex ? 'bg-primary' : 'bg-border')} />
              )}
              <span className={cn(
                'relative z-10 flex size-7 items-center justify-center rounded-full border-2 bg-card transition-colors',
                done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
                isCurrent && 'ring-4 ring-primary/20',
              )}>
                {done ? <Check className="size-4" /> : <span className="text-[11px] font-semibold">{index + 1}</span>}
              </span>
              <span className={cn('mt-1.5 px-0.5 text-[11px] leading-tight', isCurrent ? 'font-bold text-primary' : done ? 'font-medium' : 'text-muted-foreground')}>{ORDER_STATUS_LABELS[status]}</span>
              {event && <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{fmtShort(event.at)}</span>}
            </li>
          );
        })}
      </ol>
      {current === 'SHIPPED' && order.trackingRef ? (
        <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs">{order.carrier} · เลขพัสดุ <span className="font-mono font-semibold">{order.trackingRef}</span></p>
      ) : currentEvent ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">อัปเดตล่าสุด {fmt(currentEvent.at)}</p>
      ) : null}
    </div>
  );
}

/** Five-step status timeline shown to dealers: horizontal stepper on phones, vertical list from `md` up. */
export function OrderTimeline({ order }: { order: ProtoOrder }) {
  if (order.status === 'CANCELLED') {
    return <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">ออเดอร์นี้ถูกยกเลิกแล้ว</p>;
  }
  const currentIndex = ORDER_STATUS_FLOW.indexOf(order.status);
  return (
    <>
    <div className="md:hidden"><OrderStepper order={order} currentIndex={currentIndex} /></div>
    <ol className="hidden md:block">
      {ORDER_STATUS_FLOW.map((status, index) => {
        const event = order.events.find((e) => e.status === status);
        const done = index <= currentIndex;
        return (
          <li key={status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('flex size-6 items-center justify-center rounded-full border-2', done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
                {done ? <Check className="size-3.5" /> : <Circle className="size-2" />}
              </span>
              {index < ORDER_STATUS_FLOW.length - 1 && <span className={cn('min-h-6 w-0.5 flex-1', index < currentIndex ? 'bg-primary' : 'bg-border')} />}
            </div>
            <div className="pb-4">
              <p className={cn('text-sm font-medium', !done && 'text-muted-foreground')}>{ORDER_STATUS_LABELS[status]}</p>
              {event && <p className="text-xs text-muted-foreground">{fmt(event.at)}</p>}
              {status === 'SHIPPED' && order.trackingRef && <p className="text-xs">{order.carrier} · เลขพัสดุ <span className="font-mono">{order.trackingRef}</span></p>}
            </div>
          </li>
        );
      })}
    </ol>
    </>
  );
}
