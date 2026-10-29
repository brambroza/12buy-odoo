import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { listSaleOrders } from '@/lib/sale-orders';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SyncStatusBadge } from '@/components/sync-status-badge';
import { OdooSaleOrdersPanel } from '@/components/odoo-sale-orders-panel';

export const dynamic = 'force-dynamic';

export default async function SaleOrdersPage() {
  const orders = await listSaleOrders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ใบสั่งขาย</h1>
        <p className="text-sm text-muted-foreground">สร้างและติดตามการ sync ใบสั่งขายไปยัง Odoo</p>
      </div>

      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local">ในระบบนี้</TabsTrigger>
          <TabsTrigger value="odoo">ใน Odoo</TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="space-y-4">
          <div className="flex justify-end">
            <Button nativeButton={false} render={<Link href="/sale-orders/new" />}>
              <PlusCircle className="size-4" />
              สร้างใบสั่งขาย
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>รายการทั้งหมด ({orders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>รายการ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>Odoo SO</TableHead>
                    <TableHead>Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        <Link href={`/sale-orders/${order.id}`} className="hover:underline">{order.orderNo}</Link>
                      </TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{order.items.length} รายการ</TableCell>
                      <TableCell>{order.approvalStatus === 'Approved' ? 'Approved' : 'Draft'}</TableCell>
                      <TableCell>{order.odooSaleOrderName ?? '-'}</TableCell>
                      <TableCell><SyncStatusBadge status={order.odooSyncStatus} /></TableCell>
                    </TableRow>
                  ))}
                  {!orders.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ยังไม่มีใบสั่งขาย</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="odoo">
          <Card>
            <CardHeader>
              <CardTitle>ใบสั่งขายใน Odoo (sale.order)</CardTitle>
              <CardDescription>ดึงข้อมูลสดจาก Odoo ทั้งที่สร้างจากระบบนี้และที่มีอยู่แล้วใน Odoo — ดูอย่างเดียว</CardDescription>
            </CardHeader>
            <CardContent>
              <OdooSaleOrdersPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
