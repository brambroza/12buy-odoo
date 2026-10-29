'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { OdooSaleOrderSearchResult } from '@/types/odoo';

const STATE_LABELS: Record<string, string> = {
  draft: 'Quotation',
  sent: 'Quotation Sent',
  sale: 'Sale Order',
  done: 'Locked',
  cancel: 'Cancelled',
};

const STATE_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  sale: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  done: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  cancel: 'bg-destructive/15 text-destructive',
};

function money(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OdooSaleOrdersPanel() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<OdooSaleOrderSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`/api/odoo/sale-orders?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((json) => { if (!cancelled) setRows(json.data ?? []); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขที่ Odoo, อ้างอิง หรือชื่อลูกค้า..." className="pl-8" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ (Odoo)</TableHead>
            <TableHead>อ้างอิงจากระบบนี้</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead className="text-right">ยอดรวม</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> กำลังดึงข้อมูลจาก Odoo...</span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.name}</TableCell>
                <TableCell>{order.client_order_ref || '-'}</TableCell>
                <TableCell>{order.partner_id ? order.partner_id[1] : '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('border-transparent', STATE_STYLES[order.state])}>
                    {STATE_LABELS[order.state] ?? order.state}
                  </Badge>
                </TableCell>
                <TableCell>{order.date_order ? String(order.date_order).slice(0, 10) : '-'}</TableCell>
                <TableCell className="text-right font-medium">฿{money(order.amount_total)}</TableCell>
              </TableRow>
            ))
          )}
          {!loading && !rows.length && (
            <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ไม่พบใบสั่งขายใน Odoo</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
