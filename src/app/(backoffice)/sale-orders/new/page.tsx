'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OdooEntityPicker } from '@/components/odoo-entity-picker';
import type { OdooPartnerSearchResult, OdooProductSearchResult } from '@/types/odoo';

type Line = {
  key: string;
  odooProductId: number;
  productName: string;
  qty: number;
  price: number;
  discount: number;
};

function money(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NewSaleOrderPage() {
  const router = useRouter();
  const [partner, setPartner] = useState<OdooPartnerSearchResult | null>(null);
  const [remark, setRemark] = useState('');
  const [product, setProduct] = useState<OdooProductSearchResult | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.price * (1 - l.discount / 100), 0), [lines]);

  function addLine() {
    if (!product) {
      toast.error('เลือกสินค้าก่อนเพิ่มรายการ');
      return;
    }
    setLines((old) => [...old, {
      key: crypto.randomUUID(),
      odooProductId: product.id,
      productName: product.name,
      qty,
      price,
      discount,
    }]);
    setProduct(null);
    setQty(1);
    setPrice(0);
    setDiscount(0);
  }

  function removeLine(key: string) {
    setLines((old) => old.filter((l) => l.key !== key));
  }

  async function submit() {
    if (!partner) {
      toast.error('เลือกลูกค้าจาก Odoo ก่อน');
      return;
    }
    if (!lines.length) {
      toast.error('เพิ่มอย่างน้อย 1 รายการสินค้า');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/sale-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          odooPartnerId: partner.id,
          customerName: partner.name,
          taxId: partner.vat || '',
          phone: partner.phone || '',
          email: partner.email || '',
          address: partner.street || '',
          remark,
          items: lines.map(({ odooProductId, productName, qty: q, price: p, discount: d }) => ({ odooProductId, productName, qty: q, price: p, discount: d })),
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        toast.error(json.message ?? 'สร้างใบสั่งขายไม่สำเร็จ');
        return;
      }
      toast.success('สร้างใบสั่งขายสำเร็จ');
      router.push(`/sale-orders/${json.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">สร้างใบสั่งขาย</h1>
        <p className="text-sm text-muted-foreground">เลือกลูกค้าและสินค้าจากฐานข้อมูล Odoo โดยตรง</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ลูกค้า</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>ค้นหาลูกค้าใน Odoo</Label>
            <OdooEntityPicker
              endpoint="/api/odoo/partners"
              value={partner}
              onSelect={setPartner}
              placeholder="พิมพ์ชื่อหรือเลขผู้เสียภาษี..."
              renderLabel={(p) => p.name}
              renderSub={(p) => [p.vat || null, p.phone || null].filter(Boolean).join(' · ') || 'ไม่มีข้อมูลติดต่อ'}
            />
            <p className="text-xs text-muted-foreground">
              ไม่พบลูกค้าที่ต้องการ? ไปหน้า <a href="/customers" className="underline">ลูกค้า</a> เพื่อสร้างใหม่แล้ว Sync เข้า Odoo ก่อน
            </p>
          </div>
          {partner && (
            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">ชื่อลูกค้า</p><p className="font-medium">{partner.name}</p></div>
              <div><p className="text-xs text-muted-foreground">เลขผู้เสียภาษี</p><p className="font-medium">{partner.vat || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">โทรศัพท์</p><p className="font-medium">{partner.phone || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">อีเมล</p><p className="font-medium">{partner.email || '-'}</p></div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="remark">หมายเหตุ</Label>
            <Textarea id="remark" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="อ้างอิง PO / หมายเหตุเพิ่มเติม" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>รายการสินค้า</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>สินค้า</Label>
              <OdooEntityPicker
                endpoint="/api/odoo/products"
                value={product}
                onSelect={(p) => { setProduct(p); setPrice(p.list_price); }}
                placeholder="พิมพ์ชื่อหรือรหัสสินค้า..."
                renderLabel={(p) => p.name}
                renderSub={(p) => [p.default_code || null, p.list_price ? `฿${money(p.list_price)}` : null].filter(Boolean).join(' · ')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>จำนวน</Label>
              <Input type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>ราคา/หน่วย</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>ส่วนลด %</Label>
              <Input type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
            <Button variant="secondary" onClick={addLine} type="button">
              <Plus className="size-4" />
              เพิ่ม
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สินค้า</TableHead>
                <TableHead className="text-right">จำนวน</TableHead>
                <TableHead className="text-right">ราคา/หน่วย</TableHead>
                <TableHead className="text-right">ส่วนลด</TableHead>
                <TableHead className="text-right">รวม</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>{line.productName}</TableCell>
                  <TableCell className="text-right">{line.qty}</TableCell>
                  <TableCell className="text-right">{money(line.price)}</TableCell>
                  <TableCell className="text-right">{line.discount}%</TableCell>
                  <TableCell className="text-right font-medium">{money(line.qty * line.price * (1 - line.discount / 100))}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeLine(line.key)} type="button">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!lines.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">ยังไม่มีรายการสินค้า</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <span className="font-medium">ยอดรวม</span>
            <span className="text-xl font-semibold">฿{money(total)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/sale-orders')} type="button">ยกเลิก</Button>
        <Button onClick={submit} disabled={submitting} type="button">{submitting ? 'กำลังบันทึก...' : 'บันทึกร่างใบสั่งขาย'}</Button>
      </div>
    </div>
  );
}
