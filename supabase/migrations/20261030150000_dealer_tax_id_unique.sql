-- Tax id (เลขผู้เสียภาษี 13 หลัก) is the duplicate key for dealers: one web dealer per tax id,
-- and sign-ups now record it so an applicant can be matched to existing dealers / Odoo customers.
-- Idempotent: safe to run again by hand (e.g. in the Supabase SQL editor).

-- 1. Sign-up form now collects the tax id.
ALTER TABLE "DealerLead" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
CREATE INDEX IF NOT EXISTS "DealerLead_taxId_idx" ON "DealerLead"("taxId");

-- 2. Store dealer tax ids as bare 13 digits (older rows may carry TH, dashes or spaces); anything else is cleared.
UPDATE "Dealer"
SET "taxId" = NULLIF(regexp_replace("taxId", '\D', '', 'g'), '')
WHERE "taxId" IS NOT NULL AND "taxId" <> NULLIF(regexp_replace("taxId", '\D', '', 'g'), '');

-- 3. One dealer per tax id. Fails if duplicates already exist; find them first with:
--    SELECT "taxId", array_agg(id) FROM "Dealer" WHERE "taxId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "Dealer_taxId_key" ON "Dealer"("taxId") WHERE "taxId" IS NOT NULL;
