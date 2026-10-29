-- Dealer sign-up now collects the full Thai address and the owner's login (email + password).
-- Additive only. The password is stored as a scrypt hash until the lead is approved (then it becomes
-- the DEALER_OWNER account) or rejected (then the hash is cleared).
ALTER TABLE "DealerLead" ADD COLUMN "email" TEXT;
ALTER TABLE "DealerLead" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "DealerLead" ADD COLUMN "address" JSONB;
CREATE INDEX "DealerLead_email_idx" ON "DealerLead"("email");
