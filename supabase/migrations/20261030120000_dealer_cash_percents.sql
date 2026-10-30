-- Cash discount % per product family for one credit dealer, e.g. {"CAR": 2, "TRUCK": 0}.
-- Overrides the % set on the family's pricelist (/admin/prices); 0 = no cash discount for that family.
-- Families left out use the pricelist %, else the credit/cash pricelist pair.
-- Additive only: one defaulted column on "Dealer".
ALTER TABLE "Dealer" ADD COLUMN IF NOT EXISTS "typeCashPercents" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "Dealer" DROP CONSTRAINT IF EXISTS "Dealer_typeCashPercents_check";
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_typeCashPercents_check" CHECK (jsonb_typeof("typeCashPercents") = 'object');
