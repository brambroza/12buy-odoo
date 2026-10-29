-- Dealer sign-up now collects the full Thai address and the owner's login (email + password).
-- Additive only. The password is stored as a scrypt hash until the lead is approved (then it becomes
-- the DEALER_OWNER account) or rejected (then the hash is cleared).
-- Idempotent: safe to run again by hand (e.g. in the Supabase SQL editor).
ALTER TABLE "DealerLead" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "DealerLead" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "DealerLead" ADD COLUMN IF NOT EXISTS "address" JSONB;
CREATE INDEX IF NOT EXISTS "DealerLead_email_idx" ON "DealerLead"("email");
