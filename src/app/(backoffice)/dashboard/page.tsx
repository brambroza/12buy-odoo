import Link from 'next/link';
import { FileText, Users, Package, CheckCircle2, Clock, PlusCircle } from 'lucide-react';
import { listSaleOrders } from '@/lib/sale-orders';
import { listCustomers } from '@/lib/customers';
import { listProducts } from '@/lib/products';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SyncStatusBadge } from '@/components/sync-status-badge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [orders, customers, products] = await Promise.all([listSaleOrders(), listCustomers(), listProducts()]);

  const draftCount = orders.filter((o) => o.approvalStatus === 'Draft').length;
  const syncedCount = orders.filter((o) => o.odooSyncStatus === 'Synced').length;
  const recentOrders = orders.slice(0, 5);

  const stats = [
    { label: 'ใบสั่งขายทั้งหมด', value: orders.length, icon: FileText },
    { label: 'รอ Approve', value: draftCount, icon: Clock },
    { label: 'Sync สำเร็จ', value: syncedCount, icon: CheckCircle2 },
    { label: 'ลูกค้า / สินค้า (local)', value: `${customers.length} / ${products.length}`, icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ภาพรวม</h1>
          <p className="text-sm text-muted-foreground">สรุปสถานะใบสั่งขายและการ sync กับ Odoo</p>
        </div>
        <Button nativeButton={false} render={<Link href="/sale-orders/new" />}>
          <PlusCircle className="size-4" />
          สร้างใบสั่งขาย
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>ใบสั่งขายล่าสุด</CardTitle>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/sale-orders" />}>
            ดูทั้งหมด
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    <Link href={`/sale-orders/${order.id}`} className="hover:underline">{order.orderNo}</Link>
                  </TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell>{order.approvalStatus === 'Approved' ? 'Approved' : 'Draft'}</TableCell>
                  <TableCell><SyncStatusBadge status={order.odooSyncStatus} /></TableCell>
                </TableRow>
              ))}
              {!recentOrders.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">ยังไม่มีใบสั่งขาย</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
