# แผนพัฒนา: B2B Tire Dealer Ordering Platform (Next.js 16 + Odoo)

วันที่: 2026-10-16
สถานะ: Draft รอยืนยัน requirement (ดูหัวข้อ "คำถามที่ต้องตอบก่อนเริ่ม")
อัปเดต 2026-10-16: ตัดสินใจแล้ว — **เว็บเป็นเจ้าของราคา (price master) และเขียนคืน Odoo pricelist** / ใช้ **Supabase Postgres**
อัปเดต 2026-10-16 (ค่ำ): **หน้าสาธารณะก่อน login เสร็จ** — `/` landing (static, SEO, GSAP) + `/login` ต้นแบบ, dashboard เดิมย้ายไป `/dashboard` (ดู README หัวข้อ "หน้าสาธารณะก่อน login")
อัปเดต 2026-10-22: **Phase 1 Foundation (auth + roles + Dealer/Lead ใน Postgres + หลังบ้านดีลเลอร์/ใบสมัคร/ผู้ใช้) เสร็จ** — ดู README หัวข้อ "การเข้าสู่ระบบและหลังบ้าน"; ที่เหลือใน Phase 1: product sync, PriceBook ลง DB
อัปเดต 2026-10-16 (เย็น): **Phase 0.5 Prototype เสร็จ** — หน้าดีลเลอร์ 7 หน้าที่ `/shop` อ่าน Odoo จริงแบบ read-only (ดู README หัวข้อ "ต้นแบบหน้าดีลเลอร์")

---

## 1. สรุปเป้าหมาย

เว็บแอปสำหรับให้ **ดีลเลอร์ยาง** สั่งซื้อสินค้าเอง ดูราคาตามสิทธิ์ของตัวเอง และติดตามสถานะออเดอร์ตั้งแต่สั่งจนถึงจัดส่ง
โดย **Odoo เป็น source of truth** สำหรับ ลูกค้า / สินค้า / รูปภาพ / ใบสั่งขาย / สต็อก / บัญชี
**เว็บเป็น source of truth สำหรับราคาขายดีลเลอร์** (ตาราง โซน × tier × สินค้า) แล้ว sync ทางเดียวลง Odoo pricelist เพื่อให้ Odoo คิดราคาใบสั่งขาย/ใบแจ้งหนี้ตรงกับเว็บเสมอ
เว็บแอปเก็บเพิ่ม: บัญชีผู้ใช้, สิทธิ์, โซนราคา, ตารางราคา, ตะกร้า, cache, log

```
Admin  (web) ──ตั้งราคา โซน×tier×สินค้า──▶ Supabase Postgres ──sync job──▶ Odoo product.pricelist(.item)
Admin  (web) ──อนุมัติดีลเลอร์/ตั้ง tier+โซน──▶ Postgres + res.partner.property_product_pricelist (Odoo)
Dealer (web) ──สั่งซื้อ (ไม่ส่งราคา)──▶ Next.js ──JSON-RPC──▶ Odoo sale.order (คิดราคาจาก pricelist ที่เว็บ sync ไว้) ──▶ stock.picking ──▶ account.move
Dealer (web) ◀─สถานะ──── Next.js ◀─webhook/poll─ Odoo
```

---

## 2. Roles

| Role | ใครใช้ | ทำอะไรได้ |
|---|---|---|
| `SUPER_ADMIN` | เจ้าของระบบ | ทุกอย่าง + ตั้งค่า Odoo connection, จัดการ admin |
| `ADMIN` | ฝ่ายขาย/แอดมินบริษัท | อนุมัติดีลเลอร์, ตั้ง tier/โซน/pricelist, ดู-จัดการทุกออเดอร์ |
| `SALES` | เซลล์ประจำเขต | เห็นเฉพาะดีลเลอร์ในเขตตัวเอง, สั่งแทนดีลเลอร์ได้ |
| `WAREHOUSE` | คลัง/จัดส่ง | อัปเดตสถานะจัดส่ง, เลขพัสดุ, รูปหลักฐานส่ง (ถ้าไม่ทำใน Odoo) |
| `DEALER_OWNER` | เจ้าของร้านดีลเลอร์ | สั่งซื้อ, ดูออเดอร์/ใบแจ้งหนี้ของร้าน, จัดการ user ในร้าน |
| `DEALER_STAFF` | พนักงานร้านดีลเลอร์ | สั่งซื้อ, ดูออเดอร์ของร้าน (ไม่เห็นเครดิต/ราคาทุน) |

### Dealer attributes (เก็บในเว็บ + mirror บางส่วนไป Odoo)

- `dealerTypes[]` : `CAR` (ยางรถยนต์) / `TRUCK` (ยางรถบรรทุก) / `MOTORCYCLE` (ยางมอเตอร์ไซค์) — เลือกได้หลายอย่าง
- `tier` : `S` (เล็ก) / `M` (กลาง) / `L` (ใหญ่)
- `province` : จังหวัดที่ตั้งร้าน (รหัส 77 จังหวัด)
- `priceZoneId` : โซนราคา (คำนวณจาก province อัตโนมัติ, admin override ได้)
- `odooPartnerId` : ผูกกับ `res.partner` (company)
- `status` : `PENDING` / `ACTIVE` / `SUSPENDED`

**หลักการ:** 1 ดีลเลอร์ = 1 `res.partner` แบบ company ใน Odoo, user หลายคนของร้านเดียวกันอยู่ฝั่งเว็บ (ไม่สร้าง portal user ใน Odoo เพื่อประหยัด license และลดความซับซ้อน)

---

## 3. โมเดลราคา (หัวใจของระบบ) — เว็บเป็น price master, Odoo เป็นตัวใช้ราคา

### 3.1 หลักการ

- Admin ตั้งราคาขายดีลเลอร์ **ในเว็บที่เดียว** เก็บใน Postgres ของเว็บ
- เว็บ **sync ทางเดียว (เว็บ → Odoo)** ไปที่ `product.pricelist` และ `product.pricelist.item` ผ่าน RPC
- 1 ช่อง (โซน × tier) = 1 pricelist ใน Odoo ชื่ออัตโนมัติ เช่น `WEB | ภาคเหนือ | M` — เว็บสร้าง/อัปเดต/archive ให้เอง
- ดีลเลอร์ที่อนุมัติแล้ว ถูกตั้ง `property_product_pricelist` ที่ `res.partner` เป็น pricelist ของช่องตัวเอง
- ใบสั่งขายจากเว็บ **ส่ง `price_unit` ตรง** = ราคาที่ดีลเลอร์เห็นตอนสั่ง (ตัดสินใจ 2026-10-28) pricelist ใน Odoo ยังตั้งให้ตรงไว้เป็นค่าอ้างอิง
- กติกาองค์กร: **ห้ามแก้ pricelist ที่ขึ้นต้นด้วย `WEB |` ใน Odoo** เว็บจะ overwrite ทุกครั้งที่ sync; pricelist เดิมของลูกค้า (แบตเตอรี่, TBR/PCR ร้านปลีก) ไม่ยุ่ง

ความเสี่ยงที่รับไว้: ใน Odoo 17+ `price_unit` ของ order line เป็น computed field ขึ้นกับจำนวน ถ้าใครแก้จำนวนใน Odoo ราคาอาจถูกคำนวณใหม่จาก pricelist ของ partner อย่างเงียบๆ → กติกา: ห้ามแก้จำนวน/ราคาใน SO ที่มาจากเว็บ (`client_order_ref` ขึ้นต้น `WEB-`) ให้ยกเลิกแล้วสั่งใหม่ และเว็บเทียบ `amount_total` กับยอดในเว็บหลังสร้าง SO

### 3.2 โครงสร้างราคาในเว็บ

```
PriceZone      { id, name, provinces: string[] }      จังหวัดเดี่ยว หรือรวมหลายจังหวัดก็เป็นโซนเหมือนกัน
                                                       จังหวัดหนึ่งอยู่ได้แค่ 1 โซน, จังหวัดที่ไม่ถูกจัด → โซน DEFAULT
PriceBook      { id, priceZoneId, tier, odooPricelistId?, syncStatus, syncedAt }   1 แถว = 1 ช่อง โซน×tier
PriceBookEntry { priceBookId, odooProductId, price, minQty=1, effectiveFrom?, effectiveTo? }
                                                       ราคาคงที่ต่อสินค้า (map → pricelist.item แบบ fixed)
PriceBookRule  { priceBookId, categoryKey, discountPct, basePriceBookId? }
                                                       ทางลัด: ลด % ทั้ง category อ้างอิง book อื่น (map → item แบบ percentage)
```

**วิธีตั้งราคาที่แนะนำใช้งานจริง (ลดงานกรอก)**
1. ตั้ง "ราคาฐาน" ของแต่ละโซนให้ tier `L` (ราคาต่ำสุด) เป็น `PriceBookEntry` รายสินค้า
2. tier `M`, `S` ของโซนเดียวกันใช้ `PriceBookRule` บวก % จากฐาน (เช่น M = +3%, S = +6%) ต่อ category
3. สินค้าตัวไหนอยากกำหนดเอง ใส่ `PriceBookEntry` ทับได้ (entry รายสินค้าชนะ rule เสมอ — ตรงกับลำดับ priority ของ Odoo: `1_product` ชนะ `2_product_category`)
4. โซนใหม่ที่ราคาเหมือนโซนเดิม → ปุ่ม "คัดลอกจากโซน" แล้วปรับส่วนต่าง

### 3.3 กลไก sync เว็บ → Odoo

| ขั้น | รายละเอียด |
|---|---|
| Trigger | admin กด "เผยแพร่ราคา" (publish) ต่อ book หรือทั้งโซน — ไม่ sync ทุกครั้งที่พิมพ์ |
| Draft/Published | แก้ราคาได้เป็น draft ก่อน เห็น diff (สินค้า, ราคาเก่า → ใหม่) แล้วค่อย publish |
| สร้าง pricelist | ถ้า `odooPricelistId` ว่าง → `product.pricelist.create({ name, currency_id: THB })` เก็บ id กลับ |
| Diff items | อ่าน `product.pricelist.item` ของ pricelist นั้น เทียบกับ entry/rule ในเว็บ → create/write/unlink เฉพาะที่ต่าง (ไม่ลบทิ้งทั้งชุดแล้วสร้างใหม่ กัน SO draft ที่อ้างอยู่) |
| Mapping entry | `applied_on: '1_product'`, `product_tmpl_id`, `compute_price: 'fixed'`, `fixed_price`, `min_quantity`, `date_start/date_end` |
| Mapping rule | `applied_on: '2_product_category'`, `categ_id`, `compute_price: 'percentage'`, `percent_price` (ค่าลบ = บวกราคา), `base: 'pricelist'`, `base_pricelist_id` |
| Partner | เมื่อ dealer ถูกอนุมัติ หรือเปลี่ยน tier/โซน → `res.partner.write({ property_product_pricelist })` |
| Verify | หลัง sync สุ่ม 3 สินค้า เรียก `sale.order.onchange` เทียบราคากับเว็บ ไม่ตรง → mark `Failed` + แจ้ง admin |
| ปริมาณ | ~180 สินค้า × (โซน × tier) เช่น 8 โซน × 3 tier = 24 pricelist, item ไม่เกิน ~4,500 แถว Odoo รับได้สบาย; sync ครั้งแรก batch 200 แถว/call |
| Reverse check | job รายวันอ่าน items จาก Odoo เทียบกับเว็บ ถ้ามีคนแก้ใน Odoo → แจ้งเตือน + ปุ่ม "เขียนทับด้วยราคาเว็บ" |

### 3.4 ประเภทยางกับสินค้าที่เห็น

- category ใน Odoo ตั้งชื่อ `<ยี่ห้อ>-<ประเภท>` แล้ว (YK-PCR, AN-TBR, IRC-MC, GS-BT) → เว็บ map suffix: `PCR`=CAR, `TBR`=TRUCK, `MC`=MOTORCYCLE, `BT`=BATTERY (รอยืนยันว่ารวมแบตเตอรี่ไหม)
- ดีลเลอร์เห็นเฉพาะประเภทที่ตรงกับ `dealerTypes[]` ของตน
- ไม่มี variant ใน Odoo (ขนาดอยู่ในชื่อสินค้า) → เว็บ parse ขนาดจากชื่อ/รหัสเป็น filter (เช่น `195/50R15`, `11R22.5`) เก็บใน `ProductCache.size`

### 3.5 ราคาที่แสดงบนเว็บ

- หน้า catalog คำนวณจาก `PriceBookEntry`/`PriceBookRule` ในเว็บโดยตรง (เร็ว ไม่ยิง Odoo)
- ตอน checkout เรียก `sale.order.onchange` ให้ Odoo ยืนยันยอด (ทดสอบแล้ว 160–460 ms) ถ้ายอดไม่ตรงกับเว็บ (เช่น ยังไม่ได้ publish) → แจ้งผู้ใช้และใช้ราคา Odoo
- ราคาที่ส่งไป Odoo: ไม่ส่ง ให้ Odoo คิดเอง (ข้อ 3.1)

---

## 4. Order Flow และสถานะ

### 4.1 ขั้นตอน

1. ดีลเลอร์เลือกสินค้าใส่ตะกร้า (ตะกร้าเก็บในเว็บ)
2. กด "สั่งซื้อ" → เว็บสร้าง `sale.order` ใน Odoo (state `draft`) พร้อม `client_order_ref = WEB-xxxx`, `partner_id`, `pricelist_id`, `origin = "Web"`
3. Admin/Sales ตรวจ → กด Confirm (เว็บเรียก `action_confirm`) หรือตั้ง auto-confirm ตาม tier
4. Odoo สร้าง `stock.picking` อัตโนมัติ → คลังจัดของ → `button_validate`
5. เว็บอ่าน `picking` state + `carrier_tracking_ref` มาแสดง
6. Odoo ออก `account.move` (invoice) → เว็บแสดงเลขที่/ยอด/สถานะชำระ + ลิงก์ PDF

### 4.2 สถานะที่ดีลเลอร์เห็น (map จากหลายโมเดลของ Odoo)

| สถานะในเว็บ | เงื่อนไขจาก Odoo |
|---|---|
| รอยืนยัน | `sale.order.state = draft/sent` |
| ยืนยันแล้ว / กำลังจัดของ | `state = sale` และ picking `confirmed/waiting/assigned` |
| จัดส่งแล้ว | picking `done` (มี tracking ถ้ามี) |
| ส่งบางส่วน | มี picking `done` และยังมี picking ค้าง (backorder) |
| ออกใบแจ้งหนี้แล้ว | `invoice_status = invoiced` + `account.move.state = posted` |
| ชำระแล้ว | `account.move.payment_state = paid` |
| ยกเลิก | `state = cancel` |

### 4.3 วิธี sync สถานะ

- **หลัก: Odoo Automation Rule → Webhook** (Odoo 17+ Online รองรับ ไม่ต้องลง custom module): trigger เมื่อ `sale.order.state`, `stock.picking.state`, `account.move.payment_state` เปลี่ยน → POST มาที่ `/api/webhooks/odoo` (ตรวจ secret header)
- **สำรอง: Polling** ทุก 5 นาทีสำหรับออเดอร์ที่ยังไม่จบ (กัน webhook หาย)
- เว็บเก็บ `OrderMirror` (snapshot ของ sale.order) เพื่อให้หน้ารายการโหลดเร็วและไม่ยิง Odoo ทุกครั้ง

---

## 5. การแบ่งข้อมูล: อะไรอยู่ที่ไหน

| ข้อมูล | Odoo (master) | Postgres ของเว็บ |
|---|---|---|
| สินค้า, รูป, category, สต็อก | ✅ | cache (ชื่อ, รหัส, category, size, URL รูป, สต็อก) |
| ลูกค้า/ดีลเลอร์ (ชื่อ, ที่อยู่, ภาษี, เครดิต) | ✅ `res.partner` | `Dealer` (type, tier, zone, status) + FK `odooPartnerId` |
| ราคาขายดีลเลอร์ | mirror (`WEB \|` pricelists ที่เว็บเขียนให้) | ✅ **master**: `PriceZone`, `PriceBook`, `PriceBookEntry`, `PriceBookRule` |
| ใบสั่งขาย, จัดส่ง, ใบแจ้งหนี้, การชำระ | ✅ | `OrderMirror` + `OrderEvent` (timeline) |
| User/login/role/permission | ❌ | ✅ `User`, `Session`, `DealerUser` |
| ตะกร้า | ❌ | ✅ `Cart`, `CartItem` |
| Notification, audit log | ❌ | ✅ |

**เปลี่ยนจาก demo ปัจจุบัน:** ตัด CRUD ลูกค้า/สินค้าฝั่งเว็บที่ sync ไป Odoo ออก; ทิศทาง sync คือ Odoo → เว็บ สำหรับสินค้า/ลูกค้า/ออเดอร์ และ เว็บ → Odoo สำหรับราคาเท่านั้น (reuse pattern `odooSyncStatus` จาก demo ได้)

### Prisma schema (ร่าง)

```prisma
enum Role { SUPER_ADMIN ADMIN SALES WAREHOUSE DEALER_OWNER DEALER_STAFF }
enum DealerType { CAR TRUCK MOTORCYCLE }
enum DealerTier { S M L }
enum DealerStatus { PENDING ACTIVE SUSPENDED }

model User        { id, email, passwordHash?, lineUserId?, name, role, dealerId?, isActive, lastLoginAt, ... }
model Dealer      { id, name, odooPartnerId @unique, dealerTypes DealerType[], tier, province, priceZoneId?, status, approvedAt, users User[] }
model PriceZone     { id, name, provinces String[], isDefault, books PriceBook[] }
model PriceBook     { id, priceZoneId, tier, odooPricelistId? @unique, status Draft|Published, syncStatus LocalOnly|Syncing|Synced|Failed, syncError?, publishedAt?, syncedAt?, @@unique([priceZoneId, tier]) }
model PriceBookEntry{ id, priceBookId, odooTemplateId, price Decimal, minQty Int @default(1), effectiveFrom?, effectiveTo?, odooItemId?, @@unique([priceBookId, odooTemplateId, minQty]) }
model PriceBookRule { id, priceBookId, odooCategoryId, percent Decimal, basePriceBookId?, odooItemId?, @@unique([priceBookId, odooCategoryId]) }
model PriceHistory  { id, priceBookId, odooTemplateId, oldPrice?, newPrice, changedBy, createdAt }
model ProductCache  { odooTemplateId @id, odooProductId, name, defaultCode, categoryId, categoryName, dealerType, size?, listPrice, imageUrl?, qtyAvailable, isPublished, updatedAt }
model Cart        { id, dealerId, userId, items CartItem[] }
model CartItem    { id, cartId, odooProductId, qty }
model OrderMirror { id, webRef @unique, odooSaleOrderId @unique, odooName, dealerId, state, invoiceStatus, paymentState, amountTotal, pickingState?, trackingRef?, lines Json, events OrderEvent[] }
model OrderEvent  { id, orderId, type, payload Json, createdAt }
model AuditLog    { id, userId, action, entity, entityId, diff Json, createdAt }
```

---

## 5.5 หลัก UX: "ขายให้ได้มากที่สุด ด้วยขั้นตอนน้อยที่สุด"

เป้าหมายที่วัดได้ (ใช้เป็น acceptance ตอน UAT)

| ตัวชี้วัด | เป้า |
|---|---|
| ดีลเลอร์สั่งซ้ำออเดอร์เดิม | ≤ 3 แตะ จากเปิดแอปถึงกดยืนยัน |
| สั่งสินค้าใหม่ที่รู้ขนาดอยู่แล้ว | ≤ 60 วินาที บนมือถือ |
| หน้าแรกถึงเห็นราคา | ไม่ต้องกดอะไรเพิ่ม ราคาของร้านโชว์ทันทีหลัง login |
| Admin เปลี่ยนราคาทั้งโซน | ≤ 5 นาที รวม publish ไป Odoo |
| Admin อนุมัติดีลเลอร์ใหม่ | 1 หน้า 1 ปุ่ม |
| ดีลเลอร์รู้สถานะออเดอร์ | ไม่ต้องเปิดเว็บ ได้ LINE ทุกครั้งที่สถานะเปลี่ยน |

### ฝั่งดีลเลอร์ (mobile-first, ค้นยางคิดเป็น "ขนาด" ก่อน "ยี่ห้อ")

1. **ค้นหาด้วยขนาดเป็นหลัก** ช่องเดียวหน้าแรก พิมพ์ `195/65R15` หรือ `11R22.5` หรือ `90/90-17` → เห็นทุกยี่ห้อ ราคาของร้าน สต็อก เรียงถูกไปแพง พิมพ์ผิดรูปแบบ (`1956515`, `195 65 15`) ก็หาเจอ
2. **ราคาของฉัน ไม่ใช่ราคากลาง** ทุกที่โชว์ราคาตาม pricelist ของร้าน ไม่มีราคาป้ายให้สับสน
3. **สั่งซ้ำ 1 ปุ่ม** หน้าแรกมี "สั่งเหมือนครั้งก่อน" และ "สินค้าที่สั่งบ่อย" ของร้านนั้น
4. **Quick order pad** พิมพ์/วางรายการ `ขนาด จำนวน` หลายบรรทัด หรือสแกน QR บนกล่อง → ลงตะกร้าทีเดียว (เหมาะดีลเลอร์ใหญ่สั่งเป็นสิบรายการ)
5. **ตะกร้าไม่หาย** ค้างข้ามวัน/ข้ามเครื่อง เพราะเก็บใน DB ไม่ใช่ browser
6. **Checkout หน้าเดียว** ที่อยู่ส่ง (ค่าเริ่มต้นจาก Odoo), ขนส่งที่ใช้ประจำ, หมายเหตุ, ปุ่มเดียว ไม่มี step wizard
7. **สถานะเข้าใจง่าย 5 ขั้น** รอยืนยัน → กำลังจัด → ส่งแล้ว (เลขพัสดุ/ชื่อขนส่ง) → วางบิลแล้ว → ชำระแล้ว แสดงเป็น timeline ไม่ใช้ศัพท์ Odoo
8. **LINE เป็นช่องทางหลัก** login ด้วย LINE, แจ้งเตือนทุกสถานะ, ลิงก์กลับเข้าออเดอร์ได้ทันที
9. **สต็อกบอกตรงๆ** "มี" / "เหลือน้อย" / "สั่งจอง (รอ X วัน)" ไม่ให้สั่งแล้วมารู้ทีหลังว่าไม่มีของ
10. **ภาษาไทยทั้งระบบ** ตัวเลขไทยบาท ทศนิยม 2 ตำแหน่ง ไม่มีคำอังกฤษใน UI ดีลเลอร์
11. **ไม่มี popup/โฆษณา/คะแนน** ในเวอร์ชันแรก ของพวกนี้ค่อยเพิ่มเมื่อมี data ว่าดีลเลอร์ใช้จริง

### ฝั่ง Admin (คนขายใช้ทั้งวัน ต้องเร็วเหมือน Excel)

1. **ตารางราคาเป็น grid แบบ spreadsheet** ปุ่มลูกศร/Tab/วางจาก Excel ได้, filter ขนาด/ยี่ห้อ, แก้หลายช่องแล้ว publish ครั้งเดียว เห็น diff ก่อนส่ง
2. **ตั้งราคาจากสูตร** "โซนนี้ = โซนกลาง +2%" หรือ "tier S = tier L +5%" แล้ว override รายตัว ไม่ต้องกรอกทีละ 180 แถว
3. **ออเดอร์เข้าแล้วเห็นทันที** หน้า inbox ออเดอร์ใหม่ realtime (Supabase Realtime) กดยืนยัน/แก้จำนวน/ยกเลิก ได้จากแถวเดียว ไม่ต้องเปิด Odoo
4. **อนุมัติดีลเลอร์หน้าเดียว** เห็นข้อมูลที่สมัคร + ค้นหา/สร้าง partner ใน Odoo + เลือก type/tier/โซน + ปุ่มอนุมัติ
5. **สิ่งที่ผิดปกติเด้งขึ้นมาเอง** sync ราคาล้มเหลว, ออเดอร์ค้างยืนยันเกิน 2 ชม., ดีลเลอร์รอ approve, ราคาใน Odoo ถูกแก้มือ → แสดงบน dashboard + LINE กลุ่มแอดมิน

### สิ่งที่จงใจ "ไม่ทำ" ในเวอร์ชันแรก (กัน over-engineer)

- ไม่ทำ promotion engine / คูปอง / คะแนนสะสม (ใช้ราคา pricelist ให้พอก่อน)
- ไม่ทำ chat ในแอป (ใช้ LINE ที่มีอยู่)
- ไม่ทำ multi-warehouse / multi-currency
- ไม่ทำ mobile app native (PWA ติดหน้าจอมือถือพอ)
- ไม่ทำรายงานซับซ้อนในเว็บ (บัญชีดูใน Odoo)

### ทำ prototype ให้คลิกได้ก่อนเขียนจริง

Phase 0.5 (3–4 วัน): สร้างหน้าดีลเลอร์ 4 หน้า (ค้นหาขนาด, สินค้า+ตะกร้า, checkout, สถานะออเดอร์) ด้วย mock data บน Next.js ให้ดีลเลอร์จริง 2–3 รายลองกดบนมือถือ แล้วค่อย lock flow — ถูกกว่าแก้ทีหลังมาก

---

## 6. หน้าจอ

### ฝั่งดีลเลอร์
- `/login` (อีเมล/รหัสผ่าน + LINE Login)
- `/catalog` — รายการยางตาม type ของร้าน, filter ยี่ห้อ/ขนาด, ราคาตาม pricelist ของร้าน, สต็อก (แสดงเป็น "มี / น้อย / หมด" ไม่โชว์ตัวเลขจริง — ปรับได้)
- `/catalog/[id]` — รายละเอียด + variant ขนาด + ใส่ตะกร้า
- `/cart` → `/checkout` — ที่อยู่จัดส่ง (จาก Odoo delivery address), หมายเหตุ, ยืนยัน
- `/orders` — รายการออเดอร์ + สถานะ
- `/orders/[id]` — timeline, รายการสินค้า, tracking, ใบแจ้งหนี้ PDF
- `/account` — ข้อมูลร้าน, วงเงินเครดิต (ถ้าเปิด), จัดการ user ในร้าน (owner)

### ฝั่ง Admin
- `/admin/dealers` — อนุมัติ, ตั้ง type/tier/zone, ผูก Odoo partner (search จาก Odoo), ระงับ
- `/admin/zones` — จัดการโซน + จังหวัด (UI เลือกจังหวัดจากแผนที่/list)
- `/admin/prices` — ตารางราคา: เลือกโซน + tier → grid สินค้า (filter ประเภท/ยี่ห้อ/ขนาด) แก้ inline, import/export CSV, คัดลอกจากโซนอื่น, ตั้ง % rule ต่อ category, ดู diff แล้วกด "เผยแพร่ไป Odoo", ประวัติการแก้
- `/admin/prices/sync` — สถานะ sync แต่ละ book, error, ปุ่ม re-sync, ผล reverse check รายวัน
- `/admin/orders` — ทุกออเดอร์, confirm/cancel, filter ตามโซน/ดีลเลอร์/สถานะ
- `/admin/products` — ดู cache, กด sync ใหม่, ซ่อนสินค้าจากเว็บ
- `/admin/users` — จัดการ admin/sales/warehouse
- `/admin/settings` — Odoo connection test, auto-confirm policy, webhook secret

---

## 7. Tech stack

| ส่วน | เลือก | เหตุผล |
|---|---|---|
| Frontend/BFF | Next.js 16 App Router + TS + Tailwind 4 + shadcn (มีอยู่แล้ว) | ต่อยอดจาก demo |
| DB | **Supabase Postgres** + Prisma 7 (ชี้ `DATABASE_URL` ไป Supabase, ใช้ connection pooler port 6543 สำหรับ serverless) | ไม่ต้องดูแล DB เอง, ได้ Storage/Auth ในตัว |
| Auth | Supabase Auth (email/password) + LINE Login ทำเองผ่าน OIDC แล้วออก session ด้วย Supabase admin API | Supabase ไม่มี LINE provider ในตัว |
| Odoo client | เปลี่ยนเป็น **JSON-RPC** (`/jsonrpc` ผ่าน `fetch`) + retry, timeout, uid cache, rate limit | lib `xmlrpc` parse response ของ Odoo 19 ไม่ได้ (เจอ "Invalid XML-RPC message"), JSON-RPC ทดสอบแล้วใช้ได้ |
| Cache/Queue | Supabase `pg_cron` + ตาราง job ใน Postgres (เริ่มต้น) → Redis/BullMQ เมื่อโหลดสูง | ลด infra; sync ราคาเป็นงาน batch ไม่ถี่ |
| รูปสินค้า | ใช้ URL public ของ Odoo `/web/image/product.template/<id>/image_1024` ตรง (สินค้า `is_published`) ผ่าน `next/image` + cache; ไฟล์ที่เว็บสร้างเอง (สลิป, รูปส่งของ) เก็บ Supabase Storage | ทดสอบแล้วเปิดได้ HTTP 200 ไม่ต้อง login |
| Notification | LINE Messaging API (push) + email | LINE Notify ปิดบริการแล้ว (มี.ค. 2025) |
| Infra | Next.js บน DigitalOcean App Platform (หรือ Vercel) + Supabase (region Singapore) | เบี่ยงจาก standard DO Managed PG เพราะ Supabase ถูกกว่าและมี Storage/Auth รวม |
| Monitoring | Sentry + UptimeRobot | |

---

## 8. Security checklist เฉพาะงานนี้

- ดีลเลอร์ต้องเห็นเฉพาะออเดอร์/ราคาของตัวเอง → ทุก query ใส่ `dealerId` จาก session ไม่รับจาก client
- ราคาที่ใช้สร้าง SO มาจาก Odoo pricelist เท่านั้น ไม่รับ `price` จาก client (รับแค่ `productId`, `qty`)
- แก้ราคา/publish ได้เฉพาะ `ADMIN`/`SUPER_ADMIN` และบันทึก `PriceHistory` ทุกแถว
- Supabase: เปิด RLS ทุกตาราง, client ฝั่ง browser ใช้ anon key เฉพาะ auth; data access ผ่าน Next.js server (service role key อยู่ server เท่านั้น)
- Odoo API key อยู่ server-side เท่านั้น ไม่มี route ไหน proxy RPC ดิบ
- Webhook จาก Odoo ตรวจ HMAC/secret + idempotency key (odoo record id + write_date)
- Rate limit `/api/*` ต่อ user
- Audit log ทุกการเปลี่ยน tier/zone/pricelist (กระทบราคาโดยตรง)
- `.env.example` ต้องไม่มีค่า credential จริง (ตอนนี้มี — ต้องลบและ rotate key)

---

## 9. แผนงานเป็น Phase

| Phase | สัปดาห์ (ประมาณ) | ส่งมอบ |
|---|---|---|
| **0. Discovery** | 1 | ยืนยันคำถามข้อ 11, กำหนดโซนตั้งต้น, รวบรวมราคาเริ่มต้น |
| **0.5 Prototype** ✅ | 0.5–1 | เสร็จแล้ว: `/shop` 7 หน้า + `/admin` 4 หน้า (โซน, ตารางราคา zone×tier พร้อม dry-run diff, ดีลเลอร์, ออเดอร์) ใช้ข้อมูลจริงจาก Odoo แบบ read-only, ตะกร้า/ออเดอร์/ราคาจำลองในไฟล์, unit test 55 รายการ — ขั้นต่อไปให้ดีลเลอร์+แอดมินจริงลองแล้ว lock flow |
| **1. Foundation** | 2 | Supabase + Auth + roles, Dealer model, Odoo client JSON-RPC, product sync (Odoo → เว็บ), Admin: dealers/zones |
| **1.5 Price master** | 1–1.5 | PriceBook/Entry/Rule + หน้า `/admin/prices` (grid, CSV, copy zone, % rule), publish + sync เว็บ → Odoo pricelist, verify ด้วย onchange, reverse check |
| **2. Dealer ordering** | 2 | Catalog ตาม type/pricelist, cart, checkout → sale.order, หน้า orders + สถานะจาก Odoo |
| **3. Operations** | 2 | Webhook + polling, admin orders (confirm/cancel), warehouse update, invoice/payment แสดงผล, LINE notification |
| **4. Hardening + UAT** | 1–2 | Test ≥80%, load test sync, security review, คู่มือภาษาไทย, UAT กับดีลเลอร์จริง 2–3 ราย |

รวมประมาณ 9–10 สัปดาห์ (ยังไม่รวม buffer +20% สำหรับ SME) — ตัวเลขจริงรอหลัง Discovery

---

## 10. ผลตรวจ Odoo จริง (2026-10-16, ผ่าน JSON-RPC ด้วย API key ใน .env)

| หัวข้อ | ผล |
|---|---|
| Version / hosting | `saas~19.4+e` Odoo Online Enterprise → ลง custom module ไม่ได้ ใช้ standard RPC + Automation Rule |
| Modules | sale, sale_management, sale_stock, stock, account, account_accountant, delivery, base_automation, website_sale, l10n_th, crm, purchase, sale_loyalty ติดตั้งแล้ว; `stock_delivery` ยังไม่ติดตั้ง (ถ้าต้องการเลขพัสดุบน picking ต้องติดตั้ง) |
| Auth | API key ใช้ได้ (uid 2, internal user) |
| Pricelist | มี 9 รายการแล้ว: Default, TBR ร้านค้าปลีก (Cash/Credit), PCR ร้านค้าปลีก (Cash/Credit), MC 4%, แบตเตอรี่ 3 รายการ — รูปแบบ fixed ต่อสินค้า และ % ต่อ category |
| Category | 20 รายการ ตั้งชื่อ `<ยี่ห้อ>-<ประเภท>` เช่น YK-PCR, AN-TBR, IRC-MC, GS-BT (แบตเตอรี่), TM-WH → ประเภทสินค้า map ได้จาก suffix: PCR=รถยนต์, TBR=รถบรรทุก, MC=มอเตอร์ไซค์, BT=แบตเตอรี่ |
| สินค้า | 187 template / 181 variant, ไม่ใช้ variant (ขนาดอยู่ในชื่อ เช่น "ยาง 195/50R15 AL30"), มีรูป 167 รายการ, เผยแพร่ (`is_published`) 130 รายการ |
| รูปภาพ | สินค้าที่ `is_published=true` เปิด URL `/web/image/product.template/<id>/image_1024` ได้โดยไม่ต้อง login (ทดสอบแล้ว HTTP 200) → เว็บใช้ URL ตรงได้ ไม่ต้องดึง base64 |
| จังหวัด | `res.country.state` ไทยครบ 77 จังหวัด (TH-10 … ) และลูกค้า 47/48 รายมี `state_id` แล้ว → ใช้เป็น key ของโซนราคาได้ทันที |
| ลูกค้า | 48 ราย ทุกรายมี `property_product_pricelist` (ส่วนใหญ่ใช้ราคาร้านปลีกแบตเตอรี่) |
| ขนส่ง | `delivery.carrier` 220 รายการ (รถบริษัท + บริษัทขนส่งเอกชน แบบ fixed) |
| Payment term | 11 รายการ (Immediate, 7/15/21/30/45 Days, …) และ partner มี `credit_limit` |
| Order status | `sale.order` มี `delivery_status` (pending/partial/full), `invoice_status`, `picking_ids`, `invoice_ids`; `account.move` มี `payment_state` → map สถานะตามตาราง 4.2 ได้ |
| Webhook | `base.automation` รองรับ trigger `on_write`/`on_state_set` และ server action type `webhook` (มี `webhook_url`) → push สถานะมาเว็บได้โดยไม่ต้องลง module |
| ราคา | field `price` ไม่มีแล้ว, `_get_product_price` private → ใช้วิธีตามข้อ 3.5 (ทดสอบ `sale.order.onchange` แล้วได้ราคา pricelist ถูกต้อง) |
| SO required fields | `partner_id`, `date_order`, `partner_invoice_id`, `partner_shipping_id`, `picking_policy`, `document_tax_mode` (จาก l10n_th) — ต้องใส่หรือพึ่ง default ตอน create |

**ข้อสังเกต:** ระบบ Odoo นี้ขายแบตเตอรี่ด้วย ไม่ใช่แค่ยาง — ควรเพิ่ม dealer type `BATTERY` หรือยืนยันว่าเว็บขายเฉพาะยาง

## 10.5 คำตอบที่ได้แล้ว (2026-10-16) และสิ่งที่ทำในต้นแบบ

| ข้อ | คำตอบ | ผลต่อระบบ | ในต้นแบบ |
|---|---|---|---|
| ราคาเริ่มต้น | **import จาก pricelist เดิมใน Odoo** | หน้า `/admin/prices` มีปุ่มนำเข้าครั้งแรก เลือก pricelist ต้นทางแยกตามประเภทสินค้า (เดา PCR→รถยนต์, TBR→บรรทุก, MC→มอเตอร์ไซค์, แบต→แบตเตอรี่) | ✅ |
| แบตเตอรี่/กระทะล้อ | **ขายด้วย** | dealer type มี 5 แบบ CAR/TRUCK/MOTORCYCLE/BATTERY/WHEEL; ค้นหาแบตด้วยชื่อรุ่น (N100, 55D23L) | ✅ |
| สิทธิ์ publish ราคา | **ต้อง approve** | 2 ขั้น: ผู้ตั้งราคาส่งอนุมัติ (ต้องมี dry run ก่อน) → ผู้อนุมัติต้องเป็นคนละคน → เผยแพร่; แก้ไขใดๆ กลับเป็นร่างต้องอนุมัติใหม่; ระบบจริงผูกกับ role ADMIN ≠ ผู้ส่ง | ✅ (พิมพ์ชื่อแทน login) |
| การชำระเงิน | **โอนแล้วแนบสลิป** | ดีลเลอร์แนบรูปสลิปที่หน้าออเดอร์ (ถ่ายจากมือถือได้) → แอดมินเห็นสลิป+ยอด กด "ตรวจสลิปแล้ว" → ถึงจะกดยืนยันออเดอร์ได้; ระบบจริง: เก็บสลิปใน Supabase Storage + บันทึก payment ใน Odoo (`account.payment`) ตอนยืนยัน | ✅ |
| ยืนยันออเดอร์ | **แอดมินกดทุกใบ** | ไม่มี auto-confirm; `/admin/orders` เป็น inbox; เตือนค้างเกิน 2 ชม.; ระบบจริง: ยืนยัน = `action_confirm` ใน Odoo | ✅ |
| ลูกค้าเครดิต (2026-10-28) | **ร้านเครดิตจ่ายสดได้ส่วนลดท้ายบิล** | flag `Dealer.creditEnabled` ที่ `/admin/dealers`; คู่ pricelist Credit↔Cash ตั้งที่ `/admin/prices` (เดาจากชื่อ: 7↔8 TBR, 10↔9 PCR, 11↔12 TBR+PCR); ตอนสั่งร้านเครดิตเลือก เครดิต (ไม่ต้องแนบสลิป แอดมินยืนยันได้เลย) หรือ เงินสด (แนบสลิป) → ส่วนลด = Σ จำนวน × max(0, ราคา pricelist เครดิตของร้าน − ราคา pricelist เงินสดคู่กัน) ไม่เกินราคาที่ร้านเห็น; ราคารายบรรทัดยังเป็นราคาเครดิต; ระบบจริง: ส่ง SO ด้วย pricelist เครดิต + บรรทัดสินค้า "ส่วนลดเงินสด" ติดลบท้ายบิล, payment term = Immediate เมื่อจ่ายสด | ✅ |
| LINE Login | ยังไม่ตอบ | — | — |

## 11. คำถามที่ต้องตอบก่อนเริ่ม

1. ~~Odoo version/modules~~ ตรวจแล้ว (ข้อ 10) — เหลือถาม: จะติดตั้ง `stock_delivery` เพื่อเก็บเลขพัสดุใน Odoo ไหม? ~~ขายแบตเตอรี่ด้วยไหม~~ → ขายด้วย
2. **ดีลเลอร์ 1 ร้าน = 1 partner ใน Odoo** และมี user ได้หลายคน ถูกต้องไหม? ใช้ Odoo portal user ไหม (เสีย license) หรือ login เฉพาะฝั่งเว็บ (แนะนำ)?
3. ~~ราคา~~ ตัดสินใจแล้ว: เว็บเป็น master, ราคาเริ่มต้น import จาก pricelist เดิม — เหลือถาม: tier S/M ต่างจาก L เป็น % คงที่ หรือกำหนดรายตัว? (ต้นแบบรองรับทั้งสอง)
4. **โซน**: มีโซนตั้งต้นในใจกี่โซน? ค่าส่งคิดตามโซน/จังหวัดด้วยไหม?
5. **สต็อก**: ดีลเลอร์เห็นจำนวนจริง, เห็นแค่ มี/หมด, หรือไม่เห็นเลย? สั่งเกินสต็อกได้ไหม (backorder)?
6. ~~การชำระเงิน~~ ตัดสินใจแล้ว: โอนแล้วแนบสลิป; ร้านเครดิตข้ามสลิปได้ และจ่ายสดได้ส่วนลดท้ายบิล (ข้อ 10.5) — เหลือถาม: ต้องเช็ควงเงิน `credit_limit` ก่อนรับออเดอร์เครดิตไหม?
7. ~~ยืนยันออเดอร์~~ ตัดสินใจแล้ว: แอดมินกดยืนยันทุกใบ หลังตรวจสลิป
8. **จัดส่ง**: รถบริษัทเอง หรือขนส่งภายนอก (ต้อง tracking ไหม)? ต้องมีรูปหลักฐานส่งไหม?
9. **Login**: LINE Login ต้องมีตั้งแต่ Phase 1 ไหม หรืออีเมล/รหัสผ่านก่อน?
10. ~~Admin แก้ราคาที่ไหน / approve~~ ตัดสินใจแล้ว: แก้ในเว็บ, publish ต้อง approve 2 ขั้น คนตั้ง ≠ คนอนุมัติ
