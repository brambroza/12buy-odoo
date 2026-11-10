-- Sales rep salary per period, set on the targets tab next to the target. When the bonus ladder has a
-- salary per tier, the sales bonus = tier salary − the rep's salary (never below 0).
-- Idempotent; run once in the Supabase SQL Editor (after 20261106150000_commission_bonus.sql).
CREATE TABLE IF NOT EXISTS "CommissionSalary" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL REFERENCES "CommissionSource"("id") ON DELETE CASCADE,
    "odooUserId" INTEGER NOT NULL,
    "period" TEXT NOT NULL CHECK ("period" ~ '^\d{4}-\d{2}$'),
    "amount" NUMERIC(14,2) NOT NULL CHECK ("amount" >= 0),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionSalary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionSalary_source_rep_period_key" ON "CommissionSalary"("sourceId", "odooUserId", "period");
ALTER TABLE "CommissionSalary" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
