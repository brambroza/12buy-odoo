/**
 * Sales reports over web orders: pure grouping functions for /admin/reports and the dashboard range
 * picker. Cancelled orders are excluded everywhere. Days are Thai calendar days (Asia/Bangkok).
 */
import { thaiDay } from './dashboard';
import type { DealerType, ProtoOrder } from '@/lib/shop/types';

export type DateRange = { from: string; to: string };
export type RangeKey = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'year' | 'custom';
export const RANGE_LABELS: Record<RangeKey, string> = { today: 'วันนี้', '7d': '7 วัน', '30d': '30 วัน', month: 'เดือนนี้', lastMonth: 'เดือนก่อน', year: 'ปีนี้', custom: 'กำหนดเอง' };

const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 100) / 100;

/** Resolves `?range=`/`?from=`/`?to=` into an inclusive day range; invalid input falls back to this month. */
export function resolveRange(params: { range?: string; from?: string; to?: string }, now = Date.now()): { key: RangeKey; range: DateRange } {
  const today = thaiDay(now);
  const month = today.slice(0, 7);
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const key = (params.range ?? (valid(params.from) || valid(params.to) ? 'custom' : 'month')) as RangeKey;
  switch (key) {
    case 'today': return { key, range: { from: today, to: today } };
    case '7d': return { key, range: { from: thaiDay(now - 6 * DAY), to: today } };
    case '30d': return { key, range: { from: thaiDay(now - 29 * DAY), to: today } };
    case 'lastMonth': {
      const [y, m] = month.split('-').map(Number);
      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      const last = new Date(Date.UTC(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), 0)).getUTCDate();
      return { key, range: { from: `${prev}-01`, to: `${prev}-${String(last).padStart(2, '0')}` } };
    }
    case 'year': return { key, range: { from: `${today.slice(0, 4)}-01-01`, to: today } };
    case 'custom': {
      const from = valid(params.from) ?? `${month}-01`;
      const to = valid(params.to) ?? today;
      return { key, range: from <= to ? { from, to } : { from: to, to: from } };
    }
    default: return { key: 'month', range: { from: `${month}-01`, to: today } };
  }
}

/** Orders placed inside the range (by Thai day), cancelled ones dropped. */
export function ordersInRange(orders: readonly ProtoOrder[], range: DateRange): ProtoOrder[] {
  return orders.filter((o) => { if (o.status === 'CANCELLED') return false; const d = thaiDay(o.createdAt); return d >= range.from && d <= range.to; });
}

export type GroupRow = { key: string; label: string; orders: number; units: number; sales: number; paid: number; share: number };

function finish(map: Map<string, GroupRow>): GroupRow[] {
  const total = [...map.values()].reduce((s, r) => s + r.sales, 0);
  return [...map.values()].map((r) => ({ ...r, sales: round(r.sales), paid: round(r.paid), share: total ? round((r.sales / total) * 100) : 0 })).sort((a, b) => b.sales - a.sales);
}

/** Sales grouped by shop. */
export function byDealer(orders: readonly ProtoOrder[]): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const o of orders) {
    const row = map.get(o.dealerName) ?? { key: o.dealerName, label: o.dealerName, orders: 0, units: 0, sales: 0, paid: 0, share: 0 };
    row.orders += 1; row.units += o.lines.reduce((s, l) => s + l.qty, 0); row.sales += o.total; if (o.status === 'PAID') row.paid += o.total;
    map.set(o.dealerName, row);
  }
  return finish(map);
}

/** Sales grouped by product (line revenue before end-of-bill discounts). */
export function byProduct(orders: readonly ProtoOrder[]): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const o of orders) for (const l of o.lines) {
    const key = l.code || String(l.productId);
    const row = map.get(key) ?? { key, label: `${l.size ? `${l.size} ` : ''}${l.name}`, orders: 0, units: 0, sales: 0, paid: 0, share: 0 };
    row.orders += 1; row.units += l.qty; row.sales += l.qty * l.unitPrice; if (o.status === 'PAID') row.paid += l.qty * l.unitPrice;
    map.set(key, row);
  }
  return finish(map);
}

/** Sales grouped by calendar month (`YYYY-MM`), oldest first. */
export function byMonth(orders: readonly ProtoOrder[]): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const o of orders) {
    const key = thaiDay(o.createdAt).slice(0, 7);
    const row = map.get(key) ?? { key, label: key, orders: 0, units: 0, sales: 0, paid: 0, share: 0 };
    row.orders += 1; row.units += o.lines.reduce((s, l) => s + l.qty, 0); row.sales += o.total; if (o.status === 'PAID') row.paid += o.total;
    map.set(key, row);
  }
  return finish(map).sort((a, b) => a.key.localeCompare(b.key));
}

/** Sales grouped by a label looked up per order (zone, province, product family …). */
export function byLookup(orders: readonly ProtoOrder[], lookup: (o: ProtoOrder) => string | null | undefined, fallback = 'ไม่ระบุ'): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const o of orders) {
    const key = lookup(o) || fallback;
    const row = map.get(key) ?? { key, label: key, orders: 0, units: 0, sales: 0, paid: 0, share: 0 };
    row.orders += 1; row.units += o.lines.reduce((s, l) => s + l.qty, 0); row.sales += o.total; if (o.status === 'PAID') row.paid += o.total;
    map.set(key, row);
  }
  return finish(map);
}

/** Line revenue per product family using the catalog's product → family map. */
export function byFamily(orders: readonly ProtoOrder[], familyOf: (productId: number) => DealerType | undefined, labels: Record<DealerType, string>): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const o of orders) for (const l of o.lines) {
    const family = familyOf(l.productId);
    const key = family ?? 'OTHER';
    const row = map.get(key) ?? { key, label: family ? labels[family] : 'ไม่ทราบประเภท', orders: 0, units: 0, sales: 0, paid: 0, share: 0 };
    row.orders += 1; row.units += l.qty; row.sales += l.qty * l.unitPrice; if (o.status === 'PAID') row.paid += l.qty * l.unitPrice;
    map.set(key, row);
  }
  return finish(map);
}

export type RangeTotals = { orders: number; units: number; sales: number; paid: number; outstanding: number; cash: number; credit: number; avgOrder: number; dealers: number };

/** Headline numbers for a range. */
export function rangeTotals(orders: readonly ProtoOrder[]): RangeTotals {
  const t: RangeTotals = { orders: 0, units: 0, sales: 0, paid: 0, outstanding: 0, cash: 0, credit: 0, avgOrder: 0, dealers: 0 };
  const dealers = new Set<string>();
  for (const o of orders) {
    t.orders += 1; t.units += o.lines.reduce((s, l) => s + l.qty, 0); t.sales += o.total;
    if (o.status === 'PAID') t.paid += o.total; else t.outstanding += o.total;
    if (o.paymentMethod === 'CASH') t.cash += o.total; else t.credit += o.total;
    dealers.add(o.dealerName);
  }
  t.dealers = dealers.size;
  t.avgOrder = t.orders ? round(t.sales / t.orders) : 0;
  for (const k of ['sales', 'paid', 'outstanding', 'cash', 'credit'] as const) t[k] = round(t[k]);
  return t;
}

/** Daily series for a range (every day present, zeros included), oldest first. */
export function dailySeries(orders: readonly ProtoOrder[], range: DateRange): { day: string; orders: number; sales: number }[] {
  const days: string[] = [];
  const start = Date.UTC(Number(range.from.slice(0, 4)), Number(range.from.slice(5, 7)) - 1, Number(range.from.slice(8, 10)));
  for (let t = start; ; t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (day > range.to || days.length > 400) break;
    days.push(day);
  }
  const map = new Map(days.map((day) => [day, { day, orders: 0, sales: 0 }]));
  for (const o of orders) {
    const bucket = map.get(thaiDay(o.createdAt));
    if (bucket) { bucket.orders += 1; bucket.sales = round(bucket.sales + o.total); }
  }
  return [...map.values()];
}
