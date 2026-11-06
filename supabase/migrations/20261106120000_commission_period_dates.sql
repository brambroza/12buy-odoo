-- Commission period dates: a company's default pay day, and per-period end / pay date overrides.
-- Idempotent; run once in the Supabase SQL Editor.

-- Default pay day: day "payDay" (0 = last day of the month) of the month "payMonths" after the period's month.
ALTER TABLE "CommissionSource"
    ADD COLUMN IF NOT EXISTS "payDay" INTEGER NOT NULL DEFAULT 0 CHECK ("payDay" BETWEEN 0 AND 31),
    ADD COLUMN IF NOT EXISTS "payMonths" INTEGER NOT NULL DEFAULT 1 CHECK ("payMonths" BETWEEN 0 AND 6);

-- One period's own end date and/or pay date (NULL = follow the company rule). The next period
-- starts the day after this end date, so periods never overlap.
CREATE TABLE IF NOT EXISTS "CommissionPeriod" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "period" TEXT NOT NULL CHECK ("period" ~ '^\d{4}-\d{2}$'),
    "endDate" DATE,
    "payDate" DATE,
    "note" TEXT,
    "updatedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionPeriod_source_period_key" ON "CommissionPeriod"("sourceId", "period");
ALTER TABLE "CommissionPeriod" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
