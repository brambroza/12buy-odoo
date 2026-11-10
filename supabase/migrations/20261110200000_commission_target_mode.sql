-- Target modes: how a rep's collection target (before VAT, all products) turns into commission.
-- GATE = full commission when the target is met, else none (the rule so far).
-- EXCESS = only the share above the target: commission × (collected − target) ÷ collected.
-- PROPORTIONAL = commission × collected ÷ target, at most 100%.
-- LADDER = pay % of the highest step reached, steps [{ "minPercent": 80, "payPercent": 50 }, ...].
-- Idempotent; run once in the Supabase SQL Editor.
ALTER TABLE "CommissionSource"
    ADD COLUMN IF NOT EXISTS "targetMode" TEXT NOT NULL DEFAULT 'GATE' CHECK ("targetMode" IN ('GATE', 'EXCESS', 'PROPORTIONAL', 'LADDER'));
ALTER TABLE "CommissionSource"
    ADD COLUMN IF NOT EXISTS "targetSteps" JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
