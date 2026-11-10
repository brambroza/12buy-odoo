-- Invoices with cash in a period but not fully paid by its end are not counted that period; they are
-- counted (whole invoice) in the period they become fully paid. The list of those waiting is kept on
-- the run for the collections / run pages. Idempotent; run once in the Supabase SQL Editor.
ALTER TABLE "CommissionRun"
    ADD COLUMN IF NOT EXISTS "deferred" JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
