-- PDPA: when the applicant ticked the privacy-notice consent on the sign-up form (the form refuses
-- submissions without it, so new rows always carry a value; older leads stay NULL).
-- Idempotent: safe to run again by hand.
ALTER TABLE "DealerLead" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
