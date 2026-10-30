import { NextResponse, type NextRequest } from 'next/server';
import * as admin from '@/lib/admin/store';
import { DEALER_COLUMNS, ORDER_COLUMNS, ORDER_LINE_COLUMNS, PRICE_COLUMNS, exportFile, orderLineRows, type ExportFormat, type PriceRow } from '@/lib/admin/export';
import { matchesSearch, searchText } from '@/lib/admin/list';
import { ordersInRange, resolveRange } from '@/lib/admin/reports';
import { audit } from '@/lib/auth/audit';
import { can } from '@/lib/auth/permissions';
import { isAdminRole, type Role } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/session';
import { listDealers } from '@/lib/dealers/repo';
import { getCatalog, priceFor } from '@/lib/shop/catalog';
import { listAllOrders } from '@/lib/shop/store';
import { DEALER_TYPE_LABELS, type OrderStatus } from '@/lib/shop/types';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['orders', 'order-lines', 'dealers', 'prices']);

/**
 * Downloads admin lists as CSV or XLSX. Filters mirror the pages: orders take `status`, `q`, `range`/`from`/`to`
 * and `ids` (bulk selection); prices take `book`. Sales/admin only (`order.export`); dealers and prices need admin.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const role = user.role as Role;
  const { kind } = await params;
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'unknown export' }, { status: 404 });
  if (!can(role, 'order.export')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if ((kind === 'dealers' || kind === 'prices') && !isAdminRole(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const format: ExportFormat = sp.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  let file: Awaited<ReturnType<typeof exportFile>>;
  let count = 0;

  if (kind === 'orders' || kind === 'order-lines') {
    const all = await listAllOrders();
    const ids = new Set((sp.get('ids') ?? '').split(',').filter(Boolean));
    const status = sp.get('status') as OrderStatus | null;
    const q = searchText(sp.get('q') ?? undefined);
    const hasRange = sp.get('range') || sp.get('from') || sp.get('to');
    const { range } = resolveRange({ range: sp.get('range') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
    let orders = ids.size ? all.filter((o) => ids.has(o.id)) : all;
    if (status) orders = orders.filter((o) => o.status === status);
    if (q) orders = orders.filter((o) => matchesSearch(q, o.ref, o.dealerName, o.poRef, o.odoo?.saleOrderName, ...o.lines.flatMap((l) => [l.code, l.size, l.name])));
    if (hasRange) orders = ordersInRange(orders, range);
    count = orders.length;
    file = kind === 'orders' ? await exportFile(orders, ORDER_COLUMNS, 'orders', format) : await exportFile(orderLineRows(orders), ORDER_LINE_COLUMNS, 'order-lines', format);
  } else if (kind === 'dealers') {
    const dealers = await listDealers();
    count = dealers.length;
    file = await exportFile(dealers, DEALER_COLUMNS, 'dealers', format);
  } else {
    const bookId = sp.get('book') ?? '';
    const [book, catalog] = await Promise.all([admin.getBook(bookId), getCatalog()]);
    if (!book) return NextResponse.json({ error: 'book not found' }, { status: 404 });
    const zone = await admin.getZone(book.zoneId);
    const rows: PriceRow[] = catalog.products.map((p) => ({
      code: p.code, name: p.name, size: p.size?.label ?? '', brand: p.brand, type: DEALER_TYPE_LABELS[p.dealerType],
      price: book.entries[String(p.tmplId)] ?? null, base: priceFor(catalog, p, book.basePricelistId),
    })).sort((a, b) => a.type.localeCompare(b.type) || a.brand.localeCompare(b.brand) || a.size.localeCompare(b.size));
    count = rows.length;
    file = await exportFile(rows, PRICE_COLUMNS, `prices-${(zone?.name ?? 'zone').replace(/[^\p{L}\p{N}]+/gu, '-')}-${book.tier}`, format);
  }
  await audit(user.id, 'export', kind, format, { count, query: Object.fromEntries(sp.entries()) });
  return new NextResponse(new Uint8Array(file.body), { headers: { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, 'Cache-Control': 'private, no-store' } });
}
