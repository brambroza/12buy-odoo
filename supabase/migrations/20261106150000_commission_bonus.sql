-- Commission bonuses: a sales-bonus ladder on collections ("เงินพิเศษ") and a fixed amount per new customer.
-- Idempotent; run once in the Supabase SQL Editor.

-- bonusTiers: [{ "minAmount": 2300000, "bonus": 3000 }, ...]; a rep gets the bonus of the highest tier
-- their collections before VAT reach. newCustomerFrom NULL = no new-customer bonus.
ALTER TABLE "CommissionSource"
    ADD COLUMN IF NOT EXISTS "bonusTiers" JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "newCustomerBonus" NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK ("newCustomerBonus" >= 0),
    ADD COLUMN IF NOT EXISTS "newCustomerFrom" DATE;

-- A customer (Odoo commercial partner) counted as new, once per company, in the period the cash of
-- its first-ever invoice came in.
CREATE TABLE IF NOT EXISTS "CommissionNewCustomer" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "odooPartnerId" INTEGER NOT NULL,
    "partnerName" TEXT NOT NULL,
    "partnerCreated" DATE,
    "invoiceId" INTEGER NOT NULL,
    "invoiceName" TEXT NOT NULL,
    "cashDate" DATE NOT NULL,
    "odooUserId" INTEGER,
    "repName" TEXT,
    "period" TEXT NOT NULL CHECK ("period" ~ '^\d{4}-\d{2}$'),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionNewCustomer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionNewCustomer_source_partner_key" ON "CommissionNewCustomer"("sourceId", "odooPartnerId");
CREATE INDEX IF NOT EXISTS "CommissionNewCustomer_source_period_idx" ON "CommissionNewCustomer"("sourceId", "period");
ALTER TABLE "CommissionNewCustomer" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
