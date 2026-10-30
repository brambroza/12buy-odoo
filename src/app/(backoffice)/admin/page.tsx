import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck, CalendarClock, CheckCircle2, Clock, Coins, Inbox, ListTodo, ShoppingCart, Store, Tags, UserPlus, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/admin/count-up';
import * as admin from '@/lib/admin/store';
import { DUE_SOON_DAYS, DUE_URGENT_DAYS, TIME_ZONE, buildTasks, creditDues, currentTime, dueLabel, percentChange, summarizeOrders, thaiDay, type CreditDue, type DashboardTask, type SalesSummary, type TaskPriority } from '@/lib/admin/dashboard';
import { listPendingResetRequests } from '@/lib/auth/reset-requests';
import { isAdminRole, type Role } from '@/lib/auth/roles';
import { requireBackoffice } from '@/lib/auth/session';
import { listDealers } from '@/lib/dealers/repo';
import { listLeads } from '@/lib/leads/repo';
import { daysUntil } from '@/lib/odoo/api-keys';
import { getOdooConnection } from '@/lib/odoo/connection';
import { listAllCarriers } from '@/lib/odoo/delivery-carrier';
import { baht } from '@/lib/shop/catalog';
import { listAllOrders } from '@/lib/shop/store';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/shop/types';
import { RANGE_LABELS, dailySeries, ordersInRange, rangeTotals, resolveRange, type RangeKey } from '@/lib/admin/reports';
import { FilterChip } from '@/components/admin/list-kit';
import { CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRIORITY: Record<TaskPriority, { label: string; dot: string; badge: string }> = {
  urgent: { label: 'ด่วน', dot: 'bg-destructive', badge: 'bg-destructive/15 text-destructive' },
  today: { label: 'วันนี้', dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  soon: { label: 'ติดตาม', dot: 'bg-sky-500', badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
};
const TASK_ICON: Record<string, typeof Inbox> = {
  'odoo-sync': AlertTriangle, 'check-slip': Wallet, 'confirm-orders': CheckCircle2, leads: UserPlus, dealers: Store,
  'price-books': Tags, 'reset-requests': Clock, carriers: AlertTriangle, 'waiting-slip': Clock, 'credit-overdue': CalendarClock, 'credit-due-soon': CalendarClock, 'credit-payment': Wallet,
};
const STATUS_FLOW: OrderStatus[] = ['PENDING', 'PREPARING', 'SHIPPED', 'INVOICED', 'PAID', 'CANCELLED'];
const STATUS_BAR: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-500', PREPARING: 'bg-blue-500', SHIPPED: 'bg-violet-500', INVOICED: 'bg-sky-500', PAID: 'bg-emerald-500', CANCELLED: 'bg-muted-foreground/40',
};
const dateLabel = new Intl.DateTimeFormat('th-TH', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** Resolves to `fallback` when a data source fails, so one broken source never blanks the dashboard. */
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error('[admin/dashboard]', error instanceof Error ? error.message : error);
    return fallback;
  }
}

/** Back-office home: sales summary, what is waiting for approval, and today's to-do list with links to act. */
export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const [actor, rangeParams] = await Promise.all([requireBackoffice(), searchParams]);
  const isAdmin = isAdminRole(actor.role as Role);
  const [orders, leads, pendingDealers, books, zones, resets, carriers] = await Promise.all([
    safe(listAllOrders(), []),
    safe(listLeads('NEW'), []),
    safe(listDealers({ status: 'PENDING' }), []),
    isAdmin ? safe(admin.listBooks(), []) : Promise.resolve([]),
    isAdmin ? safe(admin.listZones(), []) : Promise.resolve([]),
    isAdmin ? safe(listPendingResetRequests(), []) : Promise.resolve([]),
    isAdmin ? safe(listAllCarriers().then((list) => list.filter((c) => c.active && c.published).length), null) : Promise.resolve(null),
  ]);
  const now = currentTime();
  const summary = summarizeOrders(orders, now);
  // Period tiles + chart follow the picked range; approvals and tasks are always "now".
  const { key: rangeKey, range } = resolveRange(rangeParams, now);
  const inRange = ordersInRange(orders, range);
  const period = rangeTotals(inRange);
  const series = dailySeries(inRange, range);
  const QUICK: RangeKey[] = ['today', '7d', '30d', 'month', 'lastMonth'];
  const rangeHref = (k: RangeKey) => `/admin?range=${k}`;
  const dues = creditDues(orders, now);
  const booksPending = books.filter((b) => b.status === 'PENDING_APPROVAL')
    .map((b) => ({ id: b.id, label: `${zones.find((z) => z.id === b.zoneId)?.name ?? 'โซน'} · ${b.tier}` }));
  const tasks = buildTasks({
    orders, now, newLeads: leads.length, oldestNewLeadAt: leads.at(-1)?.createdAt ? new Date(leads.at(-1)!.createdAt).toISOString() : null,
    pendingDealers: pendingDealers.length, booksPending, resetRequests: resets.length, publishedCarriers: carriers,
    apiKeyDaysLeft: isAdmin ? daysUntil((await getOdooConnection()).apiKeyExpiresAt, new Date(now)) : null,
  }).filter((t) => isAdmin || !t.adminOnly);
  const urgent = tasks.filter((t) => t.priority === 'urgent').length;
  const pendingOrders = summary.byStatus.PENDING;
  const approvals = [
    { label: 'ออเดอร์รอยืนยัน', count: pendingOrders, href: '/admin/orders?status=PENDING', icon: ShoppingCart },
    { label: 'ใบสมัครใหม่', count: leads.length, href: '/admin/leads?status=NEW', icon: UserPlus },
    { label: 'ดีลเลอร์รออนุมัติ', count: pendingDealers.length, href: '/admin/dealers?status=PENDING', icon: Store },
    ...(isAdmin ? [{ label: 'ตารางราคารออนุมัติ', count: booksPending.length, href: booksPending.length === 1 ? `/admin/prices?book=${booksPending[0].id}` : '/admin/prices', icon: Tags }] : []),
  ];
  const monthTrend = percentChange(summary.month.sales, summary.lastMonth.sales);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{dateLabel.format(now)}</p>
          <h1 className="text-2xl font-bold">สวัสดี {actor.name}</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.length === 0 ? 'วันนี้ไม่มีงานค้าง' : `วันนี้มี ${tasks.length} เรื่องที่ต้องทำ${urgent ? ` · ด่วน ${urgent} เรื่อง` : ''}`}
          </p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/orders" />}><Inbox /> ดูออเดอร์ทั้งหมด</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">ช่วงเวลา:</span>
        {QUICK.map((k) => <FilterChip key={k} href={rangeHref(k)} active={rangeKey === k}>{RANGE_LABELS[k]}</FilterChip>)}
        <Link href="/admin/reports" className="ml-auto text-primary underline">รายงานละเอียด →</Link>
      </div>
      <section aria-label="สรุปยอดขาย" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Coins} label={`ยอดขาย ${RANGE_LABELS[rangeKey]}`} value={<CountUp value={period.sales} format="baht" />} sub={`${period.orders.toLocaleString('th-TH')} ออเดอร์ · ${period.dealers} ร้าน · เฉลี่ย ${baht(period.avgOrder)}`} href={`/admin/reports?range=${rangeKey}`} />
        <StatTile icon={CalendarCheck} label="ยอดขายเดือนนี้" value={<CountUp value={summary.month.sales} format="baht" />}
          sub={<>{summary.month.orders.toLocaleString('th-TH')} ออเดอร์{monthTrend !== null && <Trend value={monthTrend} />}</>} href="/admin/reports?range=month" />
        <StatTile icon={ShoppingCart} label="วันนี้" value={<CountUp value={summary.today.sales} format="baht" />} sub={`${summary.today.orders} ออเดอร์ใหม่`} href="/admin/orders" />
        <StatTile icon={Wallet} label="รับชำระแล้ว (ทั้งหมด)" value={<CountUp value={summary.paid} format="baht" />}
          sub={`${summary.byStatus.PAID} ออเดอร์ · ค้างรับ ${baht(Math.max(0, summary.sales - summary.paid))}`} href="/admin/orders?status=PAID" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="todo-heading" className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <ListTodo className="size-5 text-primary" aria-hidden />
            <h2 id="todo-heading" className="font-semibold">สิ่งที่ต้องทำวันนี้</h2>
            {tasks.length > 0 && <Badge variant="outline" className="ml-auto">{tasks.length} เรื่อง</Badge>}
          </div>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <CheckCircle2 className="size-10 text-emerald-600" aria-hidden />
              <p className="font-medium">เคลียร์งานหมดแล้ว</p>
              <p className="text-sm text-muted-foreground">ไม่มีออเดอร์ ใบสมัคร หรือรายการที่รออนุมัติ</p>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {tasks.map((task) => <TaskRow key={task.id} task={task} />)}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <section aria-labelledby="approve-heading" className="rounded-xl border border-border bg-card p-4">
            <h2 id="approve-heading" className="mb-3 font-semibold">ค้างอนุมัติ</h2>
            <div className="grid grid-cols-2 gap-2">
              {approvals.map((a) => (
                <Link key={a.label} href={a.href} className={cn('group rounded-lg border p-3 transition-colors hover:bg-muted', a.count > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border')}>
                  <span className="flex items-center justify-between text-xs text-muted-foreground"><a.icon className="size-4" aria-hidden /><ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></span>
                  <span className="mt-1 block text-2xl font-bold tabular-nums">{a.count}</span>
                  <span className="block text-xs text-muted-foreground">{a.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <CreditDueList dues={dues} />
          <StatusBreakdown summary={summary} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <DailySales daily={series.length <= 62 ? series : summary.daily} today={thaiDay(now)} />
        <section aria-labelledby="top-heading" className="rounded-xl border border-border bg-card p-4">
          <h2 id="top-heading" className="mb-3 font-semibold">ดีลเลอร์ยอดสูงสุดเดือนนี้</h2>
          {summary.topDealers.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีออเดอร์เดือนนี้</p> : (
            <ol className="space-y-2">
              {summary.topDealers.map((d, i) => (
                <li key={d.name}>
                  <Link href={`/admin/orders?q=${encodeURIComponent(d.name)}`} className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-muted">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.orders} ออเดอร์</span>
                    <span className="font-semibold tabular-nums">{baht(d.sales)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

const dueDate = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** Credit invoices overdue or due within `DUE_SOON_DAYS`, so staff can remind the shop before the date. */
function CreditDueList({ dues }: { dues: CreditDue[] }) {
  const overdue = dues.filter((d) => d.daysLeft < 0).reduce((sum, d) => sum + d.residual, 0);
  const total = dues.reduce((sum, d) => sum + d.residual, 0);
  return (
    <section aria-labelledby="due-heading" className={cn('rounded-xl border bg-card p-4', overdue > 0 ? 'border-destructive/40' : 'border-border')}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CalendarClock className="size-5 text-primary" aria-hidden />
        <h2 id="due-heading" className="font-semibold">ครบกำหนดชำระ (ลูกค้าเครดิต)</h2>
        {dues.length > 0 && <span className="ml-auto text-xs text-muted-foreground">รวม <span className="font-semibold text-foreground tabular-nums">{baht(total)}</span></span>}
      </div>
      {dues.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีบิลเครดิตที่เลยกำหนดหรือครบกำหนดใน {DUE_SOON_DAYS} วัน</p>
      ) : (
        <ul className="space-y-1">
          {dues.slice(0, 8).map((d) => (
            <li key={`${d.orderId}-${d.invoice}`}>
              <Link href={`/admin/orders?open=${encodeURIComponent(d.orderId)}`} className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-muted">
                <span className={cn('w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium',
                  d.daysLeft < 0 ? PRIORITY.urgent.badge : d.daysLeft <= DUE_URGENT_DAYS ? PRIORITY.today.badge : PRIORITY.soon.badge)}>{dueLabel(d.daysLeft)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.dealerName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{d.invoice} · {d.ref} · ครบ {dueDate.format(new Date(`${d.dueDate}T00:00:00Z`))}</span>
                </span>
                <span className="font-semibold tabular-nums">{baht(d.residual)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {dues.length > 8 && <Link href="/admin/orders?due=all" className="mt-2 block text-center text-xs font-medium text-primary hover:underline">ดูทั้งหมด {dues.length} บิล</Link>}
      <p className="mt-2 text-[11px] text-muted-foreground">วันครบกำหนดดึงจากใบแจ้งหนี้ใน Odoo (ซิงก์สถานะอัตโนมัติ)</p>
    </section>
  );
}

/** Headline number with a label, a supporting line, and a link to the detail. */
function StatTile({ icon: Icon, label, value, sub, href }: { icon: typeof Coins; label: string; value: React.ReactNode; sub: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="group rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
      <span className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" aria-hidden /></span>
      </span>
      <span className="mt-2 block text-2xl font-bold tabular-nums sm:text-3xl">{value}</span>
      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{sub}</span>
    </Link>
  );
}

/** Month-over-month change with an arrow; the sign is in the text too, not only the colour. */
function Trend({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium', up ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/15 text-destructive')}>
      <Icon className="size-3" aria-hidden />{up ? '+' : ''}{value}% จากเดือนก่อน
    </span>
  );
}

/** One to-do: priority, what and why, and a button that opens the page where it is done. */
function TaskRow({ task }: { task: DashboardTask }) {
  const p = PRIORITY[task.priority];
  const Icon = TASK_ICON[task.id] ?? ListTodo;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg', p.badge)}><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {task.title}
          {task.count > 0 && <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background tabular-nums">{task.count}</span>}
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', p.badge)}>{p.label}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{task.detail}</p>
      </div>
      <Button size="sm" variant={task.priority === 'urgent' ? 'default' : 'outline'} className="shrink-0" nativeButton={false} render={<Link href={task.href} />}>
        {task.action} <ArrowRight />
      </Button>
    </li>
  );
}

/** Orders per status as one stacked bar plus a labelled list; every status links to its filtered list. */
function StatusBreakdown({ summary }: { summary: SalesSummary }) {
  const total = STATUS_FLOW.reduce((n, s) => n + summary.byStatus[s], 0);
  return (
    <section aria-labelledby="status-heading" className="rounded-xl border border-border bg-card p-4">
      <h2 id="status-heading" className="mb-3 font-semibold">ออเดอร์ตามสถานะ <span className="text-sm font-normal text-muted-foreground">· ทั้งหมด {total}</span></h2>
      {total > 0 && (
        <div className="mb-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {STATUS_FLOW.filter((s) => summary.byStatus[s] > 0).map((s) => <span key={s} className={cn('h-full', STATUS_BAR[s])} style={{ width: `${(summary.byStatus[s] / total) * 100}%` }} />)}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {STATUS_FLOW.map((s) => (
          <li key={s}>
            <Link href={`/admin/orders?status=${s}`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
              <span className={cn('size-2.5 shrink-0 rounded-full', STATUS_BAR[s])} aria-hidden />
              <span className="flex-1 text-muted-foreground">{ORDER_STATUS_LABELS[s]}</span>
              <span className="font-semibold tabular-nums">{summary.byStatus[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sales per day for the last 14 days: one series, thin rounded bars, hover tooltip, and a table for screen readers. */
function DailySales({ daily, today }: { daily: SalesSummary['daily']; today: string }) {
  const max = Math.max(...daily.map((d) => d.sales), 0);
  const total = daily.reduce((n, d) => n + d.sales, 0);
  const label = (day: string) => shortDay.format(new Date(`${day}T00:00:00Z`));
  return (
    <section aria-labelledby="daily-heading" className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="daily-heading" className="font-semibold">ยอดขายรายวัน · 14 วันล่าสุด</h2>
        <span className="text-sm text-muted-foreground">รวม <span className="font-semibold text-foreground tabular-nums">{baht(Math.round(total))}</span></span>
      </div>
      {max === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">ยังไม่มียอดขายใน 14 วันล่าสุด</p> : (
        <div aria-hidden className="flex h-44 items-end gap-0.5 border-b border-border sm:gap-1">
          {daily.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
              <div className={cn('mx-auto w-full max-w-7 rounded-t-[4px] transition-opacity group-hover:opacity-80', d.day === today ? 'bg-primary' : 'bg-primary/60')}
                style={{ height: d.sales > 0 ? `max(${(d.sales / max) * 100}%, 3px)` : '0' }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md group-hover:block">
                <p className="font-medium">{label(d.day)}</p>
                <p className="tabular-nums">{baht(d.sales)} · {d.orders} ออเดอร์</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {max > 0 && (
        <div aria-hidden className="mt-1 flex gap-0.5 text-[10px] text-muted-foreground sm:gap-1">
          {daily.map((d, i) => <span key={d.day} className="flex-1 text-center">{i % 3 === 0 || d.day === today ? label(d.day) : ''}</span>)}
        </div>
      )}
      <table className="sr-only">
        <caption>ยอดขายรายวัน 14 วันล่าสุด</caption>
        <thead><tr><th>วันที่</th><th>ยอดขาย</th><th>ออเดอร์</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.day}><td>{label(d.day)}</td><td>{baht(d.sales)}</td><td>{d.orders}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
