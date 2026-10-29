'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SyncStatusBadge } from '@/components/sync-status-badge';
import { OdooCustomersPanel } from '@/components/odoo-customers-panel';
import type { Customer } from '@/types/customer-product';

const emptyForm = { code: '', name: '', taxId: '', phone: '', email: '', address: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    return fetch('/api/customers', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => setCustomers(json.data ?? []));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      code: customer.code,
      name: customer.name,
      taxId: customer.taxId ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
    });
    setDialogOpen(true);
  }

  async function submit() {
    setLoading(true);
    try {
      const url = editing ? `/api/customers/${editing.id}` : '/api/customers';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? 'บันทึกไม่สำเร็จ');
        return;
      }
      toast.success(editing ? 'อัปเดตลูกค้าแล้ว' : 'สร้างลูกค้าแล้ว');
      setDialogOpen(false);
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function sync(customer: Customer) {
    setBusyId(customer.id);
    try {
      const res = await fetch(`/api/customers/${customer.id}/sync`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) toast.error(json.message ?? 'Sync ไม่สำเร็จ', { description: json.error });
      else toast.success('Sync เข้า Odoo สำเร็จ');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(customer: Customer) {
    setBusyId(customer.id);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) toast.error(json.message ?? 'ลบไม่สำเร็จ', { description: json.error });
      else toast.success('ลบลูกค้าแล้ว');
      await load();
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ลูกค้า</h1>
        <p className="text-sm text-muted-foreground">สร้าง แก้ไข และ sync ข้อมูลลูกค้าไปยัง Odoo (res.partner)</p>
      </div>

      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local">ในระบบนี้</TabsTrigger>
          <TabsTrigger value="odoo">ใน Odoo</TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreate}><Plus className="size-4" />ลูกค้าใหม่</Button>
          </div>
          <Card>
            <CardHeader><CardTitle>รายการทั้งหมด ({customers.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>เลขผู้เสียภาษี</TableHead>
                    <TableHead>Odoo ID</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">การจัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.code}</TableCell>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell>{customer.taxId || '-'}</TableCell>
                      <TableCell>{customer.odooPartnerId ?? '-'}</TableCell>
                      <TableCell><SyncStatusBadge status={customer.odooSyncStatus} /></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(customer)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon-sm" disabled={busyId === customer.id} onClick={() => sync(customer)}>
                            <RefreshCw className={`size-4 ${busyId === customer.id ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(customer)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!customers.length && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ยังไม่มีลูกค้า</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="odoo">
          <Card>
            <CardHeader>
              <CardTitle>ลูกค้าใน Odoo (res.partner)</CardTitle>
              <CardDescription>ดึงข้อมูลสดจาก Odoo — เป็นรายการอ้างอิงเท่านั้น แก้ไข/ลบไม่ได้จากที่นี่</CardDescription>
            </CardHeader>
            <CardContent>
              <OdooCustomersPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไขลูกค้า' : 'สร้างลูกค้าใหม่'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>รหัสลูกค้า</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อ</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>เลขผู้เสียภาษี</Label>
              <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>โทรศัพท์</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>อีเมล</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ที่อยู่</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={submit} disabled={loading}>{loading ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบลูกค้า {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              ระบบจะลบข้อมูลนี้ใน Odoo ด้วย (ถ้าเคย sync แล้ว) การลบนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove(deleteTarget)}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
