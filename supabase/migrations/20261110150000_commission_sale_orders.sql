-- Incentive on sales orders: a company can measure the bonus ladder ("เงินพิเศษ" / incentive) on
-- confirmed Odoo sale orders of the period instead of collections. Commission stays on collections.
-- Idempotent; run once in the Supabase SQL Editor (after 20261110120000_commission_salary.sql).

-- COLLECTION = ladder on collections before VAT, paid only when the target is met (as before).
-- SALE_ORDER = ladder on confirmed sale orders before VAT (by order date), no target needed.
ALTER TABLE "CommissionSource"
    ADD COLUMN IF NOT EXISTS "bonusBase" TEXT NOT NULL DEFAULT 'COLLECTION' CHECK ("bonusBase" IN ('COLLECTION', 'SALE_ORDER'));

-- Confirmed sale orders of a period with their rep, replaced on every pull of an open period.
CREATE TABLE IF NOT EXISTS "CommissionSaleOrder" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "period" TEXT NOT NULL CHECK ("period" ~ '^\d{4}-\d{2}$'),
    "orderId" INTEGER NOT NULL,
    "orderName" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "partnerName" TEXT NOT NULL,
    "odooUserId" INTEGER,
    "repName" TEXT,
    "amountUntaxed" NUMERIC(14,2) NOT NULL,
    "amountTotal" NUMERIC(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionSaleOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionSaleOrder_source_period_order_key" ON "CommissionSaleOrder"("sourceId", "period", "orderId");
ALTER TABLE "CommissionSaleOrder" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
