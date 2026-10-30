# Runbook — ระบบสั่งซื้อดีลเลอร์ 12buy (Next.js 16 + Supabase + Odoo)

ปรับปรุง 2026-10-30 · สำหรับทีม dev/ops ที่ดูแล production

## 1. ภาพรวมระบบ

| ส่วน | ที่อยู่ | หมายเหตุ |
| --- | --- | --- |
| เว็บ (Next.js) | Vercel region `sin1` (`vercel.json`) | SSR ทุกหน้าหลังบ้าน/ร้านค้า, หน้าสาธารณะ ISR 5 นาที |
| ฐานข้อมูล + ไฟล์ | Supabase project (Postgres 17, ap-southeast-1) | ตาราง + bucket `slips`, `avatars` ใช้ service role จากฝั่ง server เท่านั้น |
| ERP | Odoo Online (saas) | อ่านสินค้า/สต็อก/ลูกค้า, เขียน SO/ใบแจ้งหนี้/pricelist เมื่อ `ODOO_READ_ONLY=false` |
| Scheduler | GitHub Actions (`.github/workflows/odoo-status.yml`, `housekeeping.yml`) + Vercel cron รายวัน | ต้องตั้ง secrets `CRON_SECRET`, `SITE_URL` |
| Monitoring | Sentry (`SENTRY_DSN`), `GET /api/health`, UptimeRobot | health = 200 เมื่อ DB ตอบ, 503 เมื่อ DB ล่ม |
| แจ้งเตือน | LINE Messaging API (ตั้งใน `/admin/settings`) | ดีลเลอร์ผูก LINE เองที่หน้าข้อมูลร้าน |

## 2. Environment variables

ดูรายการเต็มใน `.env.example` ตัวที่ขาดไม่ได้บน production:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — ไม่มี = server ไม่ start (ตรวจใน `src/instrumentation.ts`)
- `NEXT_PUBLIC_SITE_URL` — canonical/sitemap/ลิงก์ใน LINE
- `ODOO_*` หรือบันทึกจาก `/admin/settings`; `ODOO_READ_ONLY=false` เฉพาะ deployment ที่ต้องเขียน Odoo จริง
- `CRON_SECRET` (≥16 ตัว), `TURNSTILE_SECRET_KEY`, `SETTINGS_SECRET`, `SENTRY_DSN`
- `LINE_*` เป็น fallback ของค่าที่ตั้งจากหน้าเว็บ

เปลี่ยนค่าใน Vercel → Redeploy. ห้ามใส่ค่าจริงใน `.env.example`.

## 3. Deploy

1. CI (`.github/workflows/ci.yml`) ต้องเขียว: lint, typecheck, test+coverage, build
2. Merge เข้า `main` → Vercel deploy อัตโนมัติ (Preview ก่อน Production)
3. ถ้ามี migration ใหม่ใน `supabase/migrations/` ให้ apply ก่อน deploy (ข้อ 4)
4. หลัง deploy: เปิด `/api/health`, login หลังบ้าน, ดู Sentry ว่าไม่มี error ใหม่ 10 นาทีแรก

Rollback: Vercel → Deployments → Promote deployment ก่อนหน้า. Migration เป็นแบบ additive (ADD COLUMN IF NOT EXISTS) จึง rollback โค้ดได้โดยไม่ต้องย้อน schema.

## 4. Database migration

```bash
# ลิงก์ project ครั้งแรก (ต้องมี access token ของ Supabase)
supabase link --project-ref <ref>
# ดูว่าไฟล์ไหนยังไม่ apply
supabase migration list
# apply ทั้งหมดที่ค้าง (แจ้งทีมก่อนรันบน production เสมอ)
npm run db:push
```

ทางเลือก: วาง SQL ของไฟล์ที่ค้างใน Supabase SQL Editor ทีละไฟล์ (ทุกไฟล์ idempotent) แล้ว `supabase migration repair --status applied <version>`.

Migration ที่ต้อง apply สำหรับฟีเจอร์ sprint A–C: `20261030190000_rate_limit`, `20261030200000_dealer_lead_consent`, `20261030210000_notifications`, `20261030220000_shop_cart_favorites` (และไฟล์ 20261029180000 … 20261030170000 ที่ค้างก่อนหน้า)

## 5. Backup / restore

- Supabase Pro: daily backup 7 วัน + PITR (ถ้าเปิด) ที่ Project → Database → Backups
- Export ด้วยมือก่อนงานเสี่ยง: `supabase db dump --linked -f backup-$(date +%F).sql`
- Storage (สลิป/รูป): ไม่อยู่ใน DB dump; ใช้ Supabase Storage backup หรือ `supabase storage cp -r` รายเดือน
- Restore: Backups → Restore (ทั้ง project) หรือ `psql < backup.sql` ลง project ใหม่แล้วชี้ `SUPABASE_URL` ไปที่นั่น
- `AdminState` (โซน/ตารางราคา/กลุ่ม/โปรโมชัน) เป็น JSON แถวเดียว: export จาก Table Editor ได้ทันที

## 6. Staging

- Odoo staging: `tester12buy` (neutralized copy) — ตั้งจาก `/admin/settings` หรือ `ODOO_*` ของ deployment staging
- **ควรแยก Supabase project สำหรับ staging** (ตอนนี้ใช้ร่วมกับ production): สร้าง project ใหม่ → รัน migration ทุกไฟล์ → ตั้ง env ใน Vercel Preview/Staging

## 7. งานประจำ (cron)

| งาน | ความถี่ | ตรวจอย่างไร |
| --- | --- | --- |
| `/api/cron/odoo-status` ดึงสถานะจัดส่ง/บิล/ชำระ | ทุก 10 นาที จ–ส 08:00–20:00 | Actions → odoo-status-sync เขียว; หน้า `/admin/orders` ปุ่ม “ดึงสถานะตอนนี้” |
| `/api/cron/housekeeping` ลอง push Odoo ซ้ำ + ลบ session/limit/notification/audit เก่า | รายวัน 02:30 | Actions → housekeeping; log JSON `housekeeping done` |

## 8. Incident (P1)

1. ดู `/api/health` → `down` = Supabase (status.supabase.com), `degraded` = Odoo (status.odoo.com / API key หมดอายุ)
2. Sentry → issue ล่าสุด; Vercel → Runtime Logs (log เป็น JSON มี `module`, `call`, `ms`)
3. Odoo ล่ม: เว็บยังรับออเดอร์ได้ ปุ่มยืนยันจะแจ้ง “ส่งเข้า Odoo ไม่สำเร็จ” และ housekeeping ลองซ้ำให้ 3 ครั้ง/24 ชม.; กด “ส่งเข้า Odoo อีกครั้ง” เองได้
4. API key หมดอายุ: แดชบอร์ดเตือนล่วงหน้า 14 วัน; สร้าง key ใหม่ใน Odoo แล้วบันทึกที่ `/admin/settings` (ทดสอบก่อนบันทึก)
5. Login ถูกบล็อก (rate limit): หน้าต่าง 15 นาที/อีเมล และ 15 นาที/IP; ลบแถวใน `RateLimit` ถ้าต้องปลดทันที
6. แจ้งลูกค้าภายใน 4 ชม. ตาม SLA; บันทึกเหตุการณ์ใน AuditLog ไม่จำเป็น แต่ให้สรุปใน Line กลุ่มทีม

## 9. ความปลอดภัย

- Security headers ตั้งใน `next.config.ts` (CSP เป็น report-only จนกว่าจะตั้ง `CSP_ENFORCE=true`)
- ทุก action หลังบ้านผ่าน `requirePermission`/`requireAdmin` และลง `AuditLog` (ดูได้ที่ `/admin/audit`)
- ความลับที่บันทึกจากหน้าเว็บเข้ารหัส AES-256-GCM ด้วย `SETTINGS_SECRET`; เปลี่ยนค่านี้ = ต้องบันทึก API key / LINE token ใหม่
- PDPA: `/privacy`, `/terms`; คำขอลบข้อมูล → ลบ User/Dealer ที่เกี่ยวข้องและไฟล์ใน bucket ภายใน 30 วัน
