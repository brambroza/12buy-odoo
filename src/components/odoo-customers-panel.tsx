'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { OdooPartnerSearchResult } from '@/types/odoo';

export function OdooCustomersPanel() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<OdooPartnerSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`/api/odoo/partners?q=${encodeURIComponent(query)}`)
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
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือเลขผู้เสียภาษี..." className="pl-8" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Odoo ID</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>เลขผู้เสียภาษี</TableHead>
            <TableHead>โทรศัพท์</TableHead>
            <TableHead>อีเมล</TableHead>
            <TableHead>ที่อยู่</TableHead>
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
            rows.map((partner) => (
              <TableRow key={partner.id}>
                <TableCell className="font-medium">{partner.id}</TableCell>
                <TableCell>{partner.name}</TableCell>
                <TableCell>{partner.vat || '-'}</TableCell>
                <TableCell>{partner.phone || '-'}</TableCell>
                <TableCell>{partner.email || '-'}</TableCell>
                <TableCell className="max-w-[220px] truncate">{partner.street || '-'}</TableCell>
              </TableRow>
            ))
          )}
          {!loading && !rows.length && (
            <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ไม่พบลูกค้าใน Odoo</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
