import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { SITE } from '@/lib/seo';
import { PAYMENT_METHOD_LABELS, type ProtoOrder } from '@/lib/shop/types';

const date = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const s = StyleSheet.create({
  page: { fontFamily: 'Sarabun', fontSize: 10, paddingTop: 30, paddingBottom: 40, paddingHorizontal: 36, color: '#111' },
  head: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderColor: '#111', paddingBottom: 8, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: 700 },
  ref: { fontSize: 20, fontWeight: 700, textAlign: 'right' },
  meta: { fontSize: 9, color: '#444' },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  box: { flex: 1, borderWidth: 1, borderColor: '#999', padding: 8, borderRadius: 4 },
  label: { fontSize: 8, color: '#666', marginBottom: 2 },
  big: { fontSize: 12, fontWeight: 700 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#111', paddingVertical: 5, fontWeight: 700, fontSize: 9 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 7, alignItems: 'center' },
  cChk: { width: 22 },
  cCode: { width: 80 },
  cSize: { width: 80, fontWeight: 700 },
  cName: { flex: 1 },
  cQty: { width: 60, textAlign: 'right', fontSize: 13, fontWeight: 700 },
  cUnit: { width: 70, textAlign: 'right', fontSize: 8, color: '#555' },
  checkbox: { width: 11, height: 11, borderWidth: 1, borderColor: '#111' },
  total: { marginTop: 8, textAlign: 'right', fontWeight: 700 },
  sign: { flexDirection: 'row', gap: 20, marginTop: 28 },
  signBox: { flex: 1, borderTopWidth: 1, borderColor: '#111', paddingTop: 4, fontSize: 8, color: '#555', textAlign: 'center' },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#777' },
});

/**
 * Warehouse picking / delivery note: one A4 page per order with large quantities, tick boxes, the
 * delivery address and signature lines. No prices (the dealer's copy is the order PDF, the invoice is Odoo's).
 */
export function PickingDocument({ orders }: { orders: ProtoOrder[] }) {
  return (
    <Document title={`ใบจัดของ ${orders.map((o) => o.ref).join(', ')}`} author={SITE.legalName} language="th">
      {orders.map((order) => {
        const pieces = order.lines.reduce((sum, l) => sum + l.qty, 0);
        return (
          <Page key={order.id} size="A4" style={s.page}>
            <View style={s.head}>
              <View>
                <Text style={s.title}>ใบจัดของ / ใบส่งของ</Text>
                <Text style={s.meta}>{SITE.name} · {SITE.legalName}</Text>
                <Text style={s.meta}>สั่งเมื่อ {date(order.createdAt)}{order.odoo?.saleOrderName ? ` · SO ${order.odoo.saleOrderName}` : ''}</Text>
              </View>
              <View>
                <Text style={s.ref}>{order.ref}</Text>
                <Text style={[s.meta, { textAlign: 'right' }]}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}{order.poRef ? ` · PO ${order.poRef}` : ''}</Text>
              </View>
            </View>
            <View style={s.grid}>
              <View style={[s.box, { flex: 1.4 }]}>
                <Text style={s.label}>ส่งถึง</Text>
                <Text style={s.big}>{order.dealerName}</Text>
                <Text>{order.address}</Text>
              </View>
              <View style={s.box}>
                <Text style={s.label}>ขนส่ง</Text>
                <Text style={s.big}>{order.carrier}</Text>
                {order.trackingRef ? <Text>เลขพัสดุ {order.trackingRef}</Text> : <Text style={s.meta}>เลขพัสดุ: ______________</Text>}
                <Text style={[s.meta, { marginTop: 4 }]}>รวม {order.lines.length} รายการ · {pieces} หน่วย</Text>
              </View>
            </View>
            <View style={s.th}>
              <Text style={s.cChk}> </Text>
              <Text style={s.cCode}>รหัส</Text>
              <Text style={s.cSize}>ขนาด</Text>
              <Text style={s.cName}>สินค้า</Text>
              <Text style={s.cQty}>จำนวน</Text>
              <Text style={s.cUnit}>หน่วยขาย</Text>
            </View>
            {order.lines.map((line) => (
              <View key={`${line.productId}-${line.unitId ?? 'b'}`} style={s.tr} wrap={false}>
                <View style={s.cChk}><View style={s.checkbox} /></View>
                <Text style={s.cCode}>{line.code}</Text>
                <Text style={s.cSize}>{line.size ?? '-'}</Text>
                <Text style={s.cName}>{line.name}</Text>
                <Text style={s.cQty}>{line.qty}</Text>
                <Text style={s.cUnit}>{line.unitName && line.unitQty ? `${line.unitQty} ${line.unitName}` : ''}</Text>
              </View>
            ))}
            <Text style={s.total}>รวมทั้งหมด {pieces} หน่วย</Text>
            {order.note ? <Text style={{ marginTop: 8, fontSize: 9 }}>หมายเหตุจากร้าน: {order.note}</Text> : null}
            <View style={s.sign}>
              <Text style={s.signBox}>ผู้จัดของ / วันที่</Text>
              <Text style={s.signBox}>ผู้ตรวจ / วันที่</Text>
              <Text style={s.signBox}>ผู้รับสินค้า (ลงชื่อ) / วันที่</Text>
            </View>
            <View style={s.footer} fixed>
              <Text>พิมพ์เมื่อ {date(new Date().toISOString())}</Text>
              <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
