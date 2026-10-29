# Sale Sync — Next.js 16 + Odoo Integration

ระบบขายภายนอกสำหรับสร้างใบสั่งขาย (Sale Order) โดยเลือกลูกค้าและสินค้า **จากฐานข้อมูล Odoo จริงแบบ live**
พร้อม CRUD ลูกค้า/สินค้าในระบบนี้เองแล้ว sync กลับเข้า Odoo ได้

```text
สร้างใบสั่งขาย  → เลือกลูกค้า/สินค้าจาก Odoo (search_read สด) → Approve & Sync → sale.order
CRUD ลูกค้า      → เก็บใน Postgres ของระบบนี้ → กด Sync → res.partner
CRUD สินค้า      → เก็บใน Postgres ของระบบนี้ → กด Sync → product.product
```

## สแตค

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- shadcn/ui (base-nova / Base UI) สำหรับ UI
- Supabase (Postgres) ผ่าน `@supabase/supabase-js` ฝั่ง server ด้วย service role key (`src/lib/db/`) ตารางทุกตัวเปิด RLS ไม่มี policy จึงอ่านด้วย anon key ไม่ได้
- Schema / migration อยู่ที่ `supabase/migrations` (ใช้ Supabase CLI) เลิกใช้ Prisma แล้วตั้งแต่ 2026-10-28 ของเก่าเก็บไว้ที่ `archive/prisma-2026-10-28`
- Odoo XML-RPC (`xmlrpc`) สำหรับอ่าน/เขียนข้อมูลใน Odoo จริง

## ติดตั้ง

```bash
yarn install
cp .env.example .env.local    # ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ODOO_*
supabase link --project-ref <ref>
supabase db push              # สร้าง/อัปเดตตารางจาก supabase/migrations
yarn dev
```

เปิด `http://localhost:3000`

## ยิง Odoo จริง

แก้ `.env.local` (หรือ `.env`)

```env
ODOO_MOCK=false
ODOO_URL=http://localhost:40019
ODOO_DB=go-along
ODOO_USERNAME=your_odoo_login
ODOO_API_KEY=your_api_key_or_password
ODOO_AUTO_CONFIRM=false
```

แล้ว restart `yarn dev`. ทดสอบการเชื่อมต่อได้ด้วย `node scripts/test-odoo-auth.js`

## หน้าเว็บ

| หน้า | รายละเอียด |
| --- | --- |
| `/` | ภาพรวม สรุปสถานะใบสั่งขายและ sync |
| `/sale-orders` | รายการใบสั่งขายทั้งหมด |
| `/sale-orders/new` | สร้างใบสั่งขาย — ค้นหาลูกค้า/สินค้าจาก Odoo แบบ live ผ่าน combobox |
| `/sale-orders/[id]` | รายละเอียด + ปุ่ม Approve & Sync เข้า Odoo |
| `/customers` | CRUD ลูกค้าของระบบนี้ + ปุ่ม Sync/Delete ไป Odoo |
| `/products` | CRUD สินค้าของระบบนี้ + ปุ่ม Sync/Delete ไป Odoo |

## API หลัก

### ค้นหาข้อมูลจาก Odoo (สำหรับ picker ตอนสร้างใบสั่งขาย)

```text
GET /api/odoo/partners?q=   → search_read res.partner (name/vat ilike)
GET /api/odoo/products?q=   → search_read product.product (name/default_code ilike, sale_ok=true)
```

### Customers (เก็บใน Postgres ของระบบนี้)

```text
GET    /api/customers
POST   /api/customers
GET    /api/customers/:id
PUT    /api/customers/:id
DELETE /api/customers/:id        → unlink ใน Odoo ก่อน (ถ้าเคย sync) แล้วลบ (soft delete) ในระบบนี้
POST   /api/customers/:id/sync   → create/update res.partner
```

Mapping เข้า Odoo: `code→ref` `name→name` `taxId→vat` `phone→phone` `email→email` `address→street`

### Products

```text
GET    /api/products
POST   /api/products
GET    /api/products/:id
PUT    /api/products/:id
DELETE /api/products/:id
POST   /api/products/:id/sync   → create/update product.product
```

Mapping เข้า Odoo: `code→default_code` `name→name` `price→list_price` `barcode→barcode` `canBeSold→sale_ok`

### Sale Orders

```text
GET  /api/sale-orders
POST /api/sale-orders                 → ต้องมี odooPartnerId + items[].odooProductId ที่เลือกจาก Odoo แล้ว
GET  /api/sale-orders/:id
POST /api/sale-orders/:id/approve     → sync เข้า sale.order โดยอ้าง partner_id/product_id ตรงจาก Odoo id ที่เลือกไว้
```

## วิธีทดสอบแนะนำ

1. ตั้ง `ODOO_MOCK=false` และรัน `supabase db push`
2. ไปหน้า **ลูกค้า** → สร้างลูกค้าใหม่ → กด Sync (จะได้ `odooPartnerId`)
3. ไปหน้า **สินค้า** → สร้างสินค้าใหม่ → กด Sync (จะได้ `odooProductId`)
4. ไปหน้า **สร้างใบสั่งขาย** → ค้นหาลูกค้า/สินค้าที่เพิ่ง sync (หรือที่มีอยู่แล้วใน Odoo) → เพิ่มรายการ → บันทึกร่าง
5. เข้าไปที่ใบสั่งขาย → กด **Approve & Sync**
6. ไป Odoo → Sales → Quotations แล้วค้นหาด้วย Order No (`client_order_ref`)


## การเข้าสู่ระบบและหลังบ้าน (Phase 1 Foundation, 2026-10-22)

ระบบมีบัญชีผู้ใช้จริงแล้ว (ตาราง `User`, `Session`, `Dealer`, `DealerLead`, `AuditLog` ใน Supabase) รหัสผ่านเก็บเป็น scrypt hash, session เป็น cookie `sid` (httpOnly, 30 วัน) ที่อ้างแถวในตาราง `Session`

### เริ่มใช้งานครั้งแรก
1. `supabase db push` (สร้างตารางจาก `supabase/migrations`)
2. เปิด `/setup` สร้างผู้ดูแลระบบคนแรก (SUPER_ADMIN) หน้านี้ปิดตัวเองทันทีที่มีผู้ใช้ในระบบ
3. เข้า `/admin/users` เพิ่มทีมงาน (ADMIN / SALES / WAREHOUSE) ระบบออกรหัสผ่านชั่วคราวให้แสดงครั้งเดียว ผู้ใช้ต้องตั้งรหัสใหม่ตอน login แรก

### Flow ดีลเลอร์
- ร้านสมัครจากฟอร์มหน้า landing → บันทึกเป็น `DealerLead` (ถ้าตั้ง `LEAD_WEBHOOK_URL` จะ POST แจ้งทีมขายด้วย)
- แอดมินเปิด `/admin/leads` กด "อนุมัติและสร้างร้าน" → ได้ `Dealer` สถานะ ACTIVE
- ที่ `/admin/dealers` ตั้งประเภทสินค้า / ระดับ (S M L) / จังหวัด (กำหนดโซนราคา) / ผูกลูกค้าใน Odoo / สร้างบัญชี `DEALER_OWNER` หรือ `DEALER_STAFF` ให้ร้าน / รีเซ็ตรหัส / ปิดใช้งาน / "เปิดมุมมองดีลเลอร์" (impersonate 8 ชม.)
- ร้าน login ที่ `/login` → บังคับเปลี่ยนรหัสครั้งแรก → `/shop` เห็นราคาตาม pricelist ของ partner ที่ผูก หรือตารางราคาเว็บที่ publish แล้วของโซน×ระดับ
- ร้านสถานะ PENDING / SUSPENDED login ไม่ได้ (มีข้อความบอก) ระงับร้าน = ตัด session ทุกเครื่องทันที
- เจ้าของร้านเพิ่มพนักงานเองได้ที่ `/shop/account`
- ตะกร้าและออเดอร์ผูกกับ dealer id (ใช้ข้ามเครื่องได้) ไม่ใช่ cookie เครื่อง

### สิทธิ์
| Role | เข้าได้ |
|---|---|
| SUPER_ADMIN | ทุกอย่าง รวมสร้าง SUPER_ADMIN อื่น |
| ADMIN | หลังบ้านทั้งหมด ยกเว้นสร้าง SUPER_ADMIN |
| SALES / WAREHOUSE | ออเดอร์, ดีลเลอร์ (อ่าน), ใบสมัคร (ติดต่อแล้ว/ไม่ผ่าน), เปิดมุมมองดีลเลอร์ |
| DEALER_OWNER / DEALER_STAFF | `/shop` ของร้านตัวเอง (owner เพิ่มพนักงานได้) |

`src/proxy.ts` กันเส้นทาง `/shop /admin /dashboard /sale-orders /customers /products /account` ตั้งแต่ขอบ (ไม่มี cookie → `/login?next=`) และ layout ของแต่ละโซนตรวจ role จริงอีกชั้น ทุกการเปลี่ยนแปลงสำคัญลง `AuditLog`

### ยังไม่ทำ
- LINE Login, ลืมรหัสผ่านด้วยตนเอง (ตอนนี้แอดมินรีเซ็ตให้), rate limit การ login

## หน่วยขาย (เส้น / มัด) — 2026-10-22

Odoo 19 ตั้งหน่วยขายเพิ่มไว้ที่สินค้าบางตัวผ่าน `product.template.uom_ids` (เช่น `มัด 3 เส้น`, `มัด 5 เส้น`, `มัด 10 เส้น` ซึ่งเป็น `uom.uom` ที่มี `relative_factor` ต่อ Units) catalog อ่าน `uom_id`, `uom_ids` และ `uom.uom` มาคำนวณ `product.units` (ตัวแรกคือหน่วยฐานเสมอ ชื่อไทยตามประเภท: เส้น/ลูก/วง) ดู `src/lib/shop/units.ts`

- การ์ดสินค้าและหน้าสินค้า มีตัวเลือกหน่วยเมื่อสินค้ามีมัด ราคาแสดงทั้งต่อเส้นและต่อมัด (ราคามัด = ราคาต่อเส้น × จำนวนในมัด เพราะ pricelist ใน Odoo ตั้งต่อหน่วยฐานเท่านั้น)
- ตะกร้าเก็บ `qty` เป็นหน่วยฐานเสมอ และจำ `unitId / unitQty / unitName` แยกบรรทัดระหว่าง "เส้น" กับ "มัด" ของสินค้าเดียวกัน
- สั่งเร็วพิมพ์ `100/80-14 2มัด5` (2 มัด มัดละ 5) หรือ `2มัด` (มัดเล็กสุดที่มี) ถ้าสินค้าไม่มีมัดตามที่พิมพ์จะแจ้งว่ามีหน่วยไหนให้เลือก
- ออเดอร์เก็บ `unitId` ไว้ในแต่ละบรรทัด เพื่อส่งเป็น `product_uom_id` ตอนสร้าง `sale.order` ใน Odoo (Phase 2)

## หน้าสาธารณะก่อน login (`/`, `/login`) — static, SEO, GSAP

Landing page สำหรับดีลเลอร์ที่ยังไม่ได้เข้าสู่ระบบ เป้าหมาย mobile web, pre-render เป็น static ทั้งหน้า ไม่แตะ Odoo

| หน้า | ทำอะไร |
| --- | --- |
| `/` | Hero + ตัวเลข, marquee ขนาดยาง, 5 หมวดสินค้า, demo ค้นหาด้วยขนาด (mock data), 6 ฟีเจอร์, 3 ขั้นตอน, timeline สถานะ, CTA สมัครผ่าน LINE/โทร |
| `/login` | ฟอร์มอีเมล/รหัสผ่าน + ปุ่ม LINE (ต้นแบบ: validate ฝั่ง client แล้วพาไป `/shop` ยังไม่ตรวจรหัสจริง) `noindex` |
| `/dashboard` | admin dashboard เดิมที่เคยอยู่ `/` |

SEO ที่มีให้แล้ว: `metadata` (title/description/keywords/canonical/OpenGraph/Twitter), JSON-LD (Organization + WebSite + WebApplication) ใน `src/lib/seo.ts`,
`/sitemap.xml`, `/robots.txt` (block `/shop`, `/admin`, `/api`, `/dashboard`, `/login`), `/opengraph-image` และ `/icon` สร้างด้วย `next/og`, `/manifest.webmanifest` (PWA ติดหน้าจอ เปิดที่ `/shop`)
ตั้ง `NEXT_PUBLIC_SITE_URL` ใน `.env` เป็นโดเมนจริงก่อน deploy ไม่งั้น canonical/sitemap จะชี้ localhost

Motion: GSAP + ScrollTrigger ผ่าน `src/components/landing/landing-motion.tsx` ควบคุมด้วย data attribute (`data-hero`, `data-reveal`, `data-counter`, `data-tire`, `data-marquee`)
ทำให้ section ทั้งหมดยังเป็น server component (HTML ครบสำหรับ crawler) และข้ามทุก animation เมื่อ `prefers-reduced-motion`
Font ไทยใช้ Noto Sans Thai ร่วมกับ Geist ทั้งระบบ (`--font-sans` ใน `globals.css`)

สิ่งที่ต้องเปลี่ยนก่อนใช้จริง: ชื่อ LINE `@12buy`, เบอร์โทร, และตัวเลขใน hero (60 วินาที / 3 แตะ / 77 จังหวัด) อยู่ใน `src/lib/seo.ts` และ `src/app/page.tsx`

## ต้นแบบหน้าดีลเลอร์ (`/shop`) — อ่าน Odoo อย่างเดียว

หน้าสั่งซื้อสำหรับดีลเลอร์แบบ mobile-first ใช้สินค้า/ราคา/รูป/จังหวัด/ขนส่ง **จริงจาก Odoo** แต่ **ไม่เขียนอะไรกลับ Odoo เลย**
ตะกร้าและออเดอร์เก็บใน Supabase (`ShopCart`, `ShopOrder`, migration `20261029120000_shop_store.sql`) ข้อมูลเก่าจาก `.proto-data/` ย้ายด้วย `node scripts/import-proto-data.mjs --apply`

```bash
yarn dev
# เปิด http://localhost:3000/shop บนมือถือหรือ DevTools โหมดมือถือ
```

| หน้า | ทำอะไร |
| --- | --- |
| `/shop` | ค้นหาด้วยขนาดยาง, ปุ่มสั่งซ้ำ, สินค้าที่สั่งบ่อย, ออเดอร์ล่าสุด |
| `/shop/search?q=195/65R15` | ผลค้นหาเฉพาะประเภทที่ร้านสั่งได้ เรียงราคาถูกไปแพง ราคาตาม pricelist ของร้าน |
| `/shop/product/:id` | รายละเอียด + ขนาดเดียวกันยี่ห้ออื่น |
| `/shop/quick` | วางหลายบรรทัด `ขนาด จำนวน` ลงตะกร้าทีเดียว |
| `/shop/cart` | ตะกร้า + checkout หน้าเดียว (ที่อยู่, ขนส่งจาก Odoo, หมายเหตุ) |
| `/shop/orders`, `/shop/orders/:id` | รายการออเดอร์ + timeline 5 ขั้น + แนบสลิปโอนเงิน (รูป ≤ 5 MB เก็บใน Supabase Storage bucket `slips` แบบ private ดูได้เฉพาะร้านเจ้าของออเดอร์และหลังบ้าน) + ปุ่มเดโมเลื่อนสถานะ |
| `/shop/account` | สลับมุมมองดีลเลอร์ (ประเภท / ขนาด / จังหวัด / pricelist) สำหรับทดลอง |


### ต้นแบบฝั่งแอดมิน (`/admin/*`) — อ่าน Odoo อย่างเดียวเช่นกัน

| หน้า | ทำอะไร |
| --- | --- |
| `/admin/zones` | จัดโซนราคา: ติ๊กจังหวัด (77 จังหวัดจาก Odoo) จังหวัดหนึ่งอยู่ได้โซนเดียว ที่เหลือเข้าโซนค่าเริ่มต้น |
| `/admin/prices` | ตารางราคา โซน × ขนาดดีลเลอร์ (S/M/L): นำเข้าครั้งแรกจาก pricelist เดิมใน Odoo แยกตามประเภท, ตั้ง % ต่อประเภทสินค้า, กรอกราคาคงที่รายตัว, **dry run** แสดงสิ่งที่จะ create/update/unlink ใน Odoo, ส่งอนุมัติ → อนุมัติโดยคนละคน → เผยแพร่ (มีผลเฉพาะเว็บ) |
| `/admin/dealers` | ลูกค้าจาก Odoo (`res.partner`) กำหนดประเภท/ขนาด/สถานะ โซนคำนวณจากจังหวัดใน Odoo ปุ่ม "เปิดมุมมองดีลเลอร์" สลับไปหน้า `/shop` เป็นร้านนั้นทันที |
| `/admin/orders` | inbox ออเดอร์จากเว็บ: ดูสลิปโอนเงินที่ดีลเลอร์แนบ → ตรวจสลิป → ยืนยัน → ส่งของ (ใส่เลขพัสดุ) → วางบิล → รับชำระ, ยกเลิก, เตือนออเดอร์ค้างเกิน 2 ชม. ยืนยันไม่ได้ถ้ายังไม่ตรวจสลิป |

ลำดับราคาที่ดีลเลอร์เห็น: ตารางเว็บที่เผยแพร่แล้วของโซน×ขนาดดีลเลอร์ (ราคาคงที่ → ราคาฐาน + %) → ถ้าไม่มี ใช้ pricelist ของ partner ใน Odoo
ข้อมูลแอดมิน (โซน ตารางราคา กลุ่มลูกค้า คู่ราคาเครดิต/เงินสด) เก็บใน Supabase ตาราง `AdminState` เป็นเอกสาร JSON เดียวที่มี version (บันทึกพร้อมกันไม่ทับกัน)

### กลไกป้องกันการเขียน Odoo

- `src/lib/odoo/rpc.ts` (JSON-RPC) อนุญาตเฉพาะ `search_read`, `read`, `search`, `search_count`, `fields_get`, `name_search`, `read_group` — method อื่น throw ก่อนยิง network
- client เดิม `src/lib/odoo.ts` ถูกครอบด้วย `ODOO_READ_ONLY` (ค่าเริ่มต้น = block ทุก write) ต้องตั้ง `ODOO_READ_ONLY=false` ใน env อย่างชัดเจนถึงจะ sync ได้
- request ไป Odoo ถูกต่อคิวทีละ request และ retry เมื่อเจอ HTTP 429 (Odoo Online จำกัด burst)

### ราคาในหน้าต้นแบบ

Odoo 19 ไม่มี field `price` บน `product.product` และ method ของ pricelist เป็น private จึงอ่าน `product.pricelist.item` มาคำนวณฝั่งเว็บ (`src/lib/shop/price-engine.ts`) รองรับ fixed / percentage / formula / based-on-pricelist ตามลำดับ priority ของ Odoo มี unit test ครอบคลุม (`yarn test`)

## ข้อควรระวัง

- ลูกค้า/สินค้าที่สร้างในระบบนี้แต่ยังไม่ได้กด Sync จะยังไม่ปรากฏใน picker ของหน้าสร้างใบสั่งขาย เพราะ picker ค้นหาจาก Odoo จริงเท่านั้น
- Delete ใน Odoo อาจ fail ถ้า record ถูกใช้งานแล้ว เช่น product อยู่ใน Sale Order แล้ว
- Postgres container (`docker-compose.yml`) เป็นคนละตัวกับฐานข้อมูลของ Odoo เอง — อย่าชี้ `DATABASE_URL` ไปที่ DB ของ Odoo

## ก่อน go-live: สิ่งที่ปรับเพิ่ม (2026-10-29)

- **ข้อมูลอยู่ใน Supabase ทั้งหมด**: ตะกร้า/ออเดอร์ (`ShopCart`, `ShopOrder`), การตั้งค่าแอดมิน (`AdminState`), สลิป (Storage bucket `slips` แบบ private) — migration `20261029120000_shop_store.sql` สั่งซื้อผ่านฟังก์ชัน `place_shop_order` (ล็อกตะกร้า สร้างออเดอร์ ล้างตะกร้า ใน transaction เดียว กดซ้ำไม่ได้ออเดอร์ซ้ำ) ย้ายข้อมูลเก่าด้วย `node scripts/import-proto-data.mjs --apply`
- **VAT**: อ่านภาษีขายของสินค้าแต่ละตัวจาก Odoo (`taxes_id`) สินค้า "7% (Inc)" ราคารวม VAT แล้ว สินค้าที่ภาษีไม่รวมในราคา เว็บบวก VAT ให้เหมือนที่ Odoo จะบวก ยอดที่แสดงคือยอดที่ต้องชำระจริงและตรงกับ `amount_total` ของ SO
- **เซลล์ประจำร้าน**: SO ที่สร้างจากเว็บใส่ `user_id` = เซลล์ของลูกค้าใน Odoo (`res.partner.user_id` หรือของบริษัทแม่) ถ้าไม่มีจะส่ง `false` แทนการปล่อยให้ Odoo ใส่ผู้ใช้ API หน้า `/admin/dealers` เตือนร้านที่ยังไม่ตั้งเซลล์
- **สถานะจาก Odoo**: หลังยืนยัน สถานะจัดส่ง/วางบิล/ชำระเงินมาจาก Odoo (`delivery_status`, ใบแจ้งหนี้ posted, `payment_state`) ดึงได้ 3 ทาง: ตั้ง scheduler เรียก `POST /api/cron/odoo-status` พร้อม `Authorization: Bearer $CRON_SECRET` ทุก 5–10 นาที, ปุ่ม "ดึงสถานะจาก Odoo ตอนนี้" ใน `/admin/orders`, และหน้าออเดอร์ของดีลเลอร์รีเฟรชเองถ้าเช็กล่าสุดเกิน 5 นาที เลขพัสดุยังกรอกในเว็บ (Odoo ไม่มี field นี้จนกว่าจะติดตั้ง `stock_delivery`)
