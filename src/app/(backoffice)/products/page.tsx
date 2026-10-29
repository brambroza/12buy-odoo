'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SyncStatusBadge } from '@/components/sync-status-badge';
import type { Product } from '@/types/customer-product';

const emptyForm = { code: '', name: '', price: 0, barcode: '' };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    return fetch('/api/products', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => setProducts(json.data ?? []));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({ code: product.code, name: product.name, price: product.price, barcode: product.barcode ?? '' });
    setDialogOpen(true);
  }

  async function submit() {
    setLoading(true);
    try {
      const url = editing ? `/api/products/${editing.id}` : '/api/products';
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
      toast.success(editing ? 'อัปเดตสินค้าแล้ว' : 'สร้างสินค้าแล้ว');
      setDialogOpen(false);
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function sync(product: Product) {
    setBusyId(product.id);
    try {
      const res = await fetch(`/api/products/${product.id}/sync`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) toast.error(json.message ?? 'Sync ไม่สำเร็จ', { description: json.error });
      else toast.success('Sync เข้า Odoo สำเร็จ');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(product: Product) {
    setBusyId(product.id);
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) toast.error(json.message ?? 'ลบไม่สำเร็จ', { description: json.error });
      else toast.success('ลบสินค้าแล้ว');
      await load();
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">สินค้า</h1>
          <p className="text-sm text-muted-foreground">สร้าง แก้ไข และ sync ข้อมูลสินค้าไปยัง Odoo (product.product)</p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4" />สินค้าใหม่</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>รายการทั้งหมด ({products.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead className="text-right">ราคา</TableHead>
                <TableHead>Odoo ID</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.code}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell className="text-right">{product.price.toLocaleString('th-TH')}</TableCell>
                  <TableCell>{product.odooProductId ?? '-'}</TableCell>
                  <TableCell><SyncStatusBadge status={product.odooSyncStatus} /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(product)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" disabled={busyId === product.id} onClick={() => sync(product)}>
                        <RefreshCw className={`size-4 ${busyId === product.id ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(product)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!products.length && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ยังไม่มีสินค้า</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไขสินค้า' : 'สร้างสินค้าใหม่'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>รหัสสินค้า (Internal Reference)</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อสินค้า</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ราคา</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>บาร์โค้ด</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
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
            <AlertDialogTitle>ลบสินค้า {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              ระบบจะลบข้อมูลนี้ใน Odoo ด้วย (ถ้าเคย sync แล้ว) การลบนี้ไม่สามารถย้อนกลับได้ และอาจล้มเหลวถ้าสินค้าถูกใช้งานแล้วใน Odoo
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
