-- Sales commission module: one or more Odoo companies (each with its own database and API key),
-- reps, pricelist groups, rates, overdue steps, targets, the cash-in ledger pulled from Odoo, and
-- monthly runs with approval. Read-only towards Odoo. Idempotent: safe to run again by hand.

-- An Odoo company whose commission is computed here. The API key is sealed with `encryptSecret`.
CREATE TABLE IF NOT EXISTS "CommissionSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "db" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    -- Last day of a period: 20 means 21st of the previous month to the 20th.
    "cutoffDay" INTEGER NOT NULL DEFAULT 20 CHECK ("cutoffDay" BETWEEN 1 AND 28),
    -- Per-rep statement: rows ([{key,label,family,priceGroup,paymentKind}], empty = default rows),
    -- central fund % of the total, and the hold on invoices unpaid "debtDays" after due.
    "summaryLines" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "centralPercent" NUMERIC(6,2) NOT NULL DEFAULT 5 CHECK ("centralPercent" >= 0 AND "centralPercent" <= 100),
    "debtDays" INTEGER NOT NULL DEFAULT 120 CHECK ("debtDays" >= 0),
    "debtPercent" NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK ("debtPercent" >= 0 AND "debtPercent" <= 100),
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionSource_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CommissionSource" ENABLE ROW LEVEL SECURITY;

-- Odoo salesperson (res.users) of a company, optionally linked to a web login for "my commission".
CREATE TABLE IF NOT EXISTS "CommissionRep" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "odooUserId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionRep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionRep_source_odooUser_key" ON "CommissionRep"("sourceId", "odooUserId");
CREATE INDEX IF NOT EXISTS "CommissionRep_userId_idx" ON "CommissionRep"("userId");
ALTER TABLE "CommissionRep" ENABLE ROW LEVEL SECURITY;

-- Odoo pricelist → price group (retail / wholesale / other) and the "special price" flag.
CREATE TABLE IF NOT EXISTS "CommissionPricelist" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "odooPricelistId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "priceGroup" TEXT NOT NULL DEFAULT 'OTHER' CHECK ("priceGroup" IN ('RETAIL', 'WHOLESALE', 'OTHER')),
    "isSpecial" BOOLEAN NOT NULL DEFAULT FALSE,
    -- % of the normal commission paid on special-price lines (50 = half).
    "specialPercent" NUMERIC(6,2) NOT NULL DEFAULT 50 CHECK ("specialPercent" >= 0 AND "specialPercent" <= 100),
    CONSTRAINT "CommissionPricelist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionPricelist_source_pricelist_key" ON "CommissionPricelist"("sourceId", "odooPricelistId");
ALTER TABLE "CommissionPricelist" ENABLE ROW LEVEL SECURITY;

-- Commission rate. '*' matches anything; a product id beats brand/family/group. Effective-dated:
-- changing a rule means ending the old row and adding a new one, so past periods never shift.
CREATE TABLE IF NOT EXISTS "CommissionRate" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "brand" TEXT NOT NULL DEFAULT '*',
    "family" TEXT NOT NULL DEFAULT '*',
    "priceGroup" TEXT NOT NULL DEFAULT '*' CHECK ("priceGroup" IN ('*', 'RETAIL', 'WHOLESALE', 'OTHER')),
    "odooPricelistId" INTEGER,
    "pricelistName" TEXT,
    "odooProductId" INTEGER,
    "productName" TEXT,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('PERCENT', 'PER_UNIT')),
    "value" NUMERIC(14,4) NOT NULL CHECK ("value" >= 0),
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionRate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommissionRate_sourceId_idx" ON "CommissionRate"("sourceId");
ALTER TABLE "CommissionRate" ENABLE ROW LEVEL SECURITY;

-- Pay-out % by days paid after the invoice due date (0-10 → 110%, ...). maxDays NULL = no upper bound.
CREATE TABLE IF NOT EXISTS "CommissionOverdueStep" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "minDays" INTEGER NOT NULL CHECK ("minDays" >= 0),
    "maxDays" INTEGER CHECK ("maxDays" IS NULL OR "maxDays" >= "minDays"),
    "percent" NUMERIC(6,2) NOT NULL CHECK ("percent" >= 0 AND "percent" <= 500),
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionOverdueStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommissionOverdueStep_sourceId_idx" ON "CommissionOverdueStep"("sourceId");
ALTER TABLE "CommissionOverdueStep" ENABLE ROW LEVEL SECURITY;

-- Collection target (before VAT) per rep per period ("2026-10" = 21 Sep – 20 Oct). 0 = no gate.
CREATE TABLE IF NOT EXISTS "CommissionTarget" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "odooUserId" INTEGER NOT NULL,
    "period" TEXT NOT NULL CHECK ("period" ~ '^\d{4}-\d{2}$'),
    "amount" NUMERIC(14,2) NOT NULL CHECK ("amount" >= 0),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionTarget_source_user_period_key" ON "CommissionTarget"("sourceId", "odooUserId", "period");
ALTER TABLE "CommissionTarget" ENABLE ROW LEVEL SECURITY;

-- Cash received in a period, split down to invoice lines (snapshot of Odoo at sync time).
-- kind RETRO = correction for a locked earlier period (cancelled payment, bounced cheque...).
CREATE TABLE IF NOT EXISTS "CommissionLedger" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COLLECTION' CHECK ("kind" IN ('COLLECTION', 'RETRO')),
    "originPeriod" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "receiptName" TEXT NOT NULL,
    "cashDate" DATE NOT NULL,
    "partnerName" TEXT NOT NULL DEFAULT '',
    "invoiceId" INTEGER,
    "invoiceName" TEXT,
    "invoiceDate" DATE,
    "dueDate" DATE,
    "overdueDays" INTEGER,
    -- CASH = invoice due the day it is issued (Immediate Payment), CREDIT otherwise.
    "paymentKind" TEXT NOT NULL DEFAULT 'CREDIT' CHECK ("paymentKind" IN ('CASH', 'CREDIT')),
    "odooUserId" INTEGER,
    "repName" TEXT,
    "ownerFrom" TEXT NOT NULL DEFAULT 'none',
    "pricelistId" INTEGER,
    "pricelistName" TEXT,
    "pricelistFrom" TEXT NOT NULL DEFAULT 'none',
    "productId" INTEGER,
    "productName" TEXT,
    "brand" TEXT NOT NULL DEFAULT '',
    "family" TEXT NOT NULL DEFAULT '',
    "qty" NUMERIC(14,4) NOT NULL DEFAULT 0,
    "base" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "gross" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "issues" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionLedger_source_period_kind_line_key" ON "CommissionLedger"("sourceId", "period", "kind", "lineKey");
CREATE INDEX IF NOT EXISTS "CommissionLedger_source_origin_idx" ON "CommissionLedger"("sourceId", "originPeriod");
ALTER TABLE "CommissionLedger" ENABLE ROW LEVEL SECURITY;

-- Amount held from a rep for an invoice unpaid "debtDays" after due (held once, in heldPeriod),
-- given back in the period its cash comes in (releasedPeriod).
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

-- One run per company per period. Results and the rules used are frozen in JSON once approved.
CREATE TABLE IF NOT EXISTS "CommissionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID')),
    "syncedAt" TIMESTAMP(3),
    "calculatedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "results" JSONB,
    "totalPayable" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionRun_source_period_key" ON "CommissionRun"("sourceId", "period");
ALTER TABLE "CommissionRun" ENABLE ROW LEVEL SECURITY;

-- Manual correction on a run (reason required); positive adds, negative deducts.
CREATE TABLE IF NOT EXISTS "CommissionAdjustment" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL REFERENCES "CommissionRun"("id") ON DELETE CASCADE,
    "odooUserId" INTEGER NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL,
    "reason" TEXT NOT NULL CHECK (length(trim("reason")) > 0),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommissionAdjustment_runId_idx" ON "CommissionAdjustment"("runId");
ALTER TABLE "CommissionAdjustment" ENABLE ROW LEVEL SECURITY;
