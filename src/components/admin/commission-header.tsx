import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ctxQuery, type CommissionContext } from '@/lib/commission/context';
import { periodLabel } from '@/lib/commission/period';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/admin/commission', label: 'รอบค่าคอม' },
  { href: '/admin/commission/collections', label: 'ยอดเก็บได้' },
  { href: '/admin/commission/sales', label: 'ยอดขายตามกลุ่มราคา' },
  { href: '/admin/commission/targets', label: 'เป้า' },
  { href: '/admin/commission/rates', label: 'อัตราค่าคอม' },
  { href: '/admin/commission/steps', label: 'ขั้นบันไดเกินดิว' },
  { href: '/admin/commission/statement', label: 'ใบสรุปค่าคอม' },
  { href: '/admin/commission/periods', label: 'ตั้งค่ารอบ / การจ่าย' },
  { href: '/admin/commission/reps', label: 'พนักงานขาย' },
  { href: '/admin/commission/sources', label: 'บริษัท / Odoo' },
] as const;

const select = 'h-9 rounded-lg border border-border bg-background px-2 text-sm';

/**
 * Title, tabs and the company / period picker shared by every commission page. The picker is a
 * GET form, so the choice lives in the URL and survives reloads and links. `showPeriod` hides the
 * period select on pages that do not depend on it (rates, steps, ...).
 */
export function CommissionHeader({ ctx, path, title, description, showPeriod = true, actions }: {
  ctx: CommissionContext; path: string; title: string; description?: ReactNode; showPeriod?: boolean; actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <nav aria-label="เมนูค่าคอม" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = t.href === '/admin/commission' ? path === t.href || path.startsWith('/admin/commission/runs') : path.startsWith(t.href);
          return (
            <Link key={t.href} href={`${t.href}?${ctxQuery(ctx)}`} aria-current={active ? 'page' : undefined}
              className={cn('shrink-0 rounded-full border px-3 py-1 text-xs font-medium', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      {ctx.sources.length > 0 && (
        <form action={path} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <label className="flex items-center gap-2">บริษัท
            <select name="source" defaultValue={ctx.source?.id} className={select}>
              {ctx.sources.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (ปิดใช้งาน)'}</option>)}
            </select>
          </label>
          {showPeriod ? (
            <label className="flex items-center gap-2">รอบ
              <select name="period" defaultValue={ctx.period} className={select}>
                {ctx.periods.map((p) => <option key={p} value={p}>{periodLabel(p, ctx.calendar)}</option>)}
              </select>
            </label>
          ) : <input type="hidden" name="period" value={ctx.period} />}
          <Button type="submit" size="sm" variant="outline" className="h-9">แสดง</Button>
        </form>
      )}
    </div>
  );
}

/** Shown on pages that need a company when none is set up yet. */
export function NoSource() {
  return (
    <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
      ยังไม่มีบริษัท เพิ่มการเชื่อมต่อ Odoo ของบริษัทก่อนที่ <Link href="/admin/commission/sources" className="text-primary underline">บริษัท / Odoo</Link>
    </p>
  );
}

/** Success / error banner from `?saved=` and `?error=`. */
export function Notice({ saved, error }: { saved?: string; error?: string }) {
  return (
    <>
      {saved && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{saved === '1' ? 'บันทึกแล้ว' : saved}</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
