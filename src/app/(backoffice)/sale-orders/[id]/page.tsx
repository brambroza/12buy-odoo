import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { findSaleOrder } from '@/lib/sale-orders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SyncStatusBadge } from '@/components/sync-status-badge';
import { ApproveButton } from './approve-button';

function money(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function SaleOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await findSaleOrder(id);
  if (!order) notFound();

  const total = order.items.reduce((sum, l) => sum + l.qty * l.price * (1 - l.discount / 100), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Link href="/sale-orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> กลับไปรายการใบสั่งขาย
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{order.orderNo}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{order.approvalStatus === 'Approved' ? 'Approved' : 'Draft'}</span>
            <SyncStatusBadge status={order.odooSyncStatus} />
            {order.odooSaleOrderName && <span>→ Odoo: {order.odooSaleOrderName}</span>}
          </div>
        </div>
        <ApproveButton orderId={order.id} disabled={order.odooSyncStatus === 'Synced'} />
      </div>

      {order.odooSyncError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">Sync error: {order.odooSyncError}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>ข้อมูลลูกค้า</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">ชื่อลูกค้า</p><p className="font-medium">{order.customerName}</p></div>
          <div><p className="text-xs text-muted-foreground">เลขผู้เสียภาษี</p><p className="font-medium">{order.taxId || '-'}</p></div>
          <div><p className="text-xs text-muted-foreground">โทรศัพท์</p><p className="font-medium">{order.phone || '-'}</p></div>
          <div><p className="text-xs text-muted-foreground">อีเมล</p><p className="font-medium">{order.email || '-'}</p></div>
          {order.remark && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">หมายเหตุ</p><p className="font-medium">{order.remark}</p></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>รายการสินค้า</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สินค้า</TableHead>
                <TableHead className="text-right">จำนวน</TableHead>
                <TableHead className="text-right">ราคา/หน่วย</TableHead>
                <TableHead className="text-right">ส่วนลด</TableHead>
                <TableHead className="text-right">รวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell className="text-right">{item.qty}</TableCell>
                  <TableCell className="text-right">{money(item.price)}</TableCell>
                  <TableCell className="text-right">{item.discount}%</TableCell>
                  <TableCell className="text-right font-medium">{money(item.qty * item.price * (1 - item.discount / 100))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <span className="font-medium">ยอดรวม</span>
            <span className="text-xl font-semibold">฿{money(total)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
