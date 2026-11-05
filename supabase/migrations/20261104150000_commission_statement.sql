-- Per-rep statement (client sheet rows, central fund, overdue-debt hold) and rates per Odoo pricelist.
-- Databases that ran 20261104120000_commission.sql before these columns were added get them here;
-- every statement is idempotent, so it is a no-op where the newer 20261104120000 already ran.

ALTER TABLE "CommissionSource"
    ADD COLUMN IF NOT EXISTS "summaryLines" JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "centralPercent" NUMERIC(6,2) NOT NULL DEFAULT 5 CHECK ("centralPercent" >= 0 AND "centralPercent" <= 100),
    ADD COLUMN IF NOT EXISTS "debtDays" INTEGER NOT NULL DEFAULT 120 CHECK ("debtDays" >= 0),
    ADD COLUMN IF NOT EXISTS "debtPercent" NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK ("debtPercent" >= 0 AND "debtPercent" <= 100);

ALTER TABLE "CommissionRate"
    ADD COLUMN IF NOT EXISTS "odooPricelistId" INTEGER,
    ADD COLUMN IF NOT EXISTS "pricelistName" TEXT;

ALTER TABLE "CommissionLedger"
    ADD COLUMN IF NOT EXISTS "paymentKind" TEXT NOT NULL DEFAULT 'CREDIT' CHECK ("paymentKind" IN ('CASH', 'CREDIT'));

-- Amount held from a rep for an invoice unpaid "debtDays" after due (held once, in heldPeriod),
-- given back in releasedPeriod when the invoice is paid and its cash is collected.
CREATE TABLE IF NOT EXISTS "CommissionDebtHold" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "invoiceId" INTEGER NOT NULL,
    "invoiceName" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL DEFAULT '',
    "dueDate" DATE NOT NULL,
    "odooUserId" INTEGER,
    "repName" TEXT,
    "residualBase" NUMERIC(14,2) NOT NULL,
    "percent" NUMERIC(6,2) NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL CHECK ("amount" >= 0),
    "heldPeriod" TEXT NOT NULL CHECK ("heldPeriod" ~ '^\d{4}-\d{2}$'),
    "releasedPeriod" TEXT CHECK ("releasedPeriod" IS NULL OR "releasedPeriod" ~ '^\d{4}-\d{2}$'),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionDebtHold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionDebtHold_source_invoice_key" ON "CommissionDebtHold"("sourceId", "invoiceId");
ALTER TABLE "CommissionDebtHold" ENABLE ROW LEVEL SECURITY;

-- Let PostgREST (supabase-js) see the new table and columns right away.
NOTIFY pgrst, 'reload schema';
