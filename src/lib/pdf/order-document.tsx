import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { SITE } from '@/lib/seo';
import { billTotals, uniformCashPercent, withCoupon } from '@/lib/shop/pricing';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type ProtoOrder } from '@/lib/shop/types';

const money = (n: number) => `${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });

const RED = '#d9342b';
const s = StyleSheet.create({
  page: { fontFamily: 'Sarabun', fontSize: 10, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, color: '#1f1f1f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  brand: { fontSize: 18, fontWeight: 700, color: RED },
  company: { fontSize: 9, color: '#555', marginTop: 2, maxWidth: 300, lineHeight: 1.4 },
  docTitle: { fontSize: 16, fontWeight: 700, textAlign: 'right' },
  meta: { fontSize: 9, color: '#555', textAlign: 'right', marginTop: 2 },
  badge: { marginTop: 6, alignSelf: 'flex-end', backgroundColor: '#fde8e6', color: RED, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, fontSize: 9, fontWeight: 700 },
  rule: { height: 2, backgroundColor: RED, marginBottom: 14 },
  cols: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  box: { flex: 1, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 6, padding: 10 },
  boxTitle: { fontSize: 9, fontWeight: 700, color: '#777', marginBottom: 4, textTransform: 'uppercase' },
  strong: { fontWeight: 700 },
  tableHead: { flexDirection: 'row', backgroundColor: '#f6f6f6', borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 6, paddingHorizontal: 6, fontWeight: 700, fontSize: 9 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 6, paddingHorizontal: 6 },
  cIdx: { width: 22 },
  cName: { flex: 1 },
  cQty: { width: 70, textAlign: 'right' },
  cPrice: { width: 80, textAlign: 'right' },
  cTotal: { width: 90, textAlign: 'right' },
  sub: { fontSize: 8, color: '#777' },
  totals: { marginTop: 10, alignSelf: 'flex-end', width: 260 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  tGrand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#333', marginTop: 4, paddingTop: 6 },
  grand: { fontSize: 13, fontWeight: 700 },
  note: { marginTop: 16, fontSize: 9, color: '#555', lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#888' },
});

/**
 * "ใบสั่งซื้อ" the dealer can download or print: parties, lines, end-of-bill discounts, VAT and total,
 * exactly as shown on the web. Not a tax document; the invoice comes from Odoo.
 */
export function OrderDocument({ order, dealer }: { order: ProtoOrder; dealer: { name: string; taxId?: string | null; phone?: string | null } }) {
  const bill = withCoupon(billTotals(order.lines.map((l) => ({ ...l, vatRate: l.vatRate ?? 7 })), order.paymentMethod), order.couponDiscount);
  const cashPercent = uniformCashPercent(order.lines);
  const pieces = order.lines.reduce((sum, l) => sum + l.qty, 0);
  return (
    <Document title={`ใบสั่งซื้อ ${order.ref}`} author={SITE.legalName} language="th">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{SITE.name}</Text>
            <Text style={s.company}>{SITE.legalName}{'\n'}{SITE.address}{'\n'}โทร {SITE.phone} · LINE {SITE.lineId}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>ใบสั่งซื้อ</Text>
            <Text style={s.meta}>เลขที่ {order.ref}</Text>
            <Text style={s.meta}>วันที่สั่ง {date(order.createdAt)}</Text>
            {order.odoo?.saleOrderName && <Text style={s.meta}>ใบสั่งขาย Odoo {order.odoo.saleOrderName}</Text>}
            <Text style={s.badge}>{ORDER_STATUS_LABELS[order.status]}</Text>
          </View>
        </View>
        <View style={s.rule} />

        <View style={s.cols}>
          <View style={s.box}>
            <Text style={s.boxTitle}>ร้านค้า</Text>
            <Text style={s.strong}>{dealer.name}</Text>
            {dealer.taxId && <Text>เลขผู้เสียภาษี {dealer.taxId}</Text>}
            {dealer.phone && <Text>โทร {dealer.phone}</Text>}
            {order.poRef && <Text>เลขที่ PO ของร้าน {order.poRef}</Text>}
          </View>
          <View style={s.box}>
            <Text style={s.boxTitle}>จัดส่ง</Text>
            <Text>{order.address}</Text>
            <Text style={{ marginTop: 3 }}>ขนส่ง: {order.carrier}{order.trackingRef ? ` · เลขพัสดุ ${order.trackingRef}` : ''}</Text>
            <Text style={{ marginTop: 3 }}>ชำระ: {PAYMENT_METHOD_LABELS[order.paymentMethod]}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={s.cIdx}>#</Text>
          <Text style={s.cName}>รายการ</Text>
          <Text style={s.cQty}>จำนวน</Text>
          <Text style={s.cPrice}>ราคา/หน่วย</Text>
          <Text style={s.cTotal}>รวม</Text>
        </View>
        {order.lines.map((line, i) => (
          <View key={`${line.productId}-${line.unitId ?? 'b'}`} style={s.row} wrap={false}>
            <Text style={s.cIdx}>{i + 1}</Text>
            <View style={s.cName}>
              <Text>{line.size ? `${line.size}  ` : ''}{line.name}</Text>
              <Text style={s.sub}>{line.code}{line.unitName && line.unitQty ? ` · ${line.unitQty} ${line.unitName}` : ''}</Text>
            </View>
            <Text style={s.cQty}>{line.qty}</Text>
            <Text style={s.cPrice}>{money(line.unitPrice)}</Text>
            <Text style={s.cTotal}>{money(line.qty * line.unitPrice)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.tRow}><Text>รวมราคาสินค้า ({pieces} หน่วย)</Text><Text>{money(order.subtotal)}</Text></View>
          {order.cashDiscount > 0 && <View style={s.tRow}><Text>ส่วนลดเงินสด{cashPercent !== null ? ` ${cashPercent}%` : ''}</Text><Text>−{money(order.cashDiscount)}</Text></View>}
          {order.couponDiscount > 0 && order.coupon && <View style={s.tRow}><Text>คูปอง {order.coupon.code}</Text><Text>−{money(order.couponDiscount)}</Text></View>}
          {bill.vatAdded > 0 && <View style={s.tRow}><Text>VAT 7% (สินค้าที่ราคายังไม่รวม VAT)</Text><Text>+{money(bill.vatAdded)}</Text></View>}
          <View style={s.tGrand}><Text style={s.grand}>ยอดสุทธิ (รวม VAT)</Text><Text style={s.grand}>{money(order.total)} บาท</Text></View>
          {bill.vat > 0 && <View style={s.tRow}><Text style={s.sub}>ในยอดนี้มี VAT</Text><Text style={s.sub}>{money(bill.vat)}</Text></View>}
        </View>

        {order.note ? <Text style={s.note}>หมายเหตุจากร้าน: {order.note}</Text> : null}
        <Text style={s.note}>เอกสารนี้สรุปคำสั่งซื้อจากระบบดีลเลอร์ ไม่ใช่ใบกำกับภาษี ใบแจ้งหนี้/ใบกำกับภาษีออกจากระบบบัญชีของบริษัทตามข้อมูลร้านที่ลงทะเบียนไว้</Text>

        <View style={s.footer} fixed>
          <Text>{SITE.name} · พิมพ์เมื่อ {date(new Date().toISOString())}</Text>
          <Text render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
