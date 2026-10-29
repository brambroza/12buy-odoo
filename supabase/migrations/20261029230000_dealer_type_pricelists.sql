-- Odoo pricelist per product family for one dealer, e.g. {"MOTORCYCLE": 7, "CAR": 9}:
-- motorcycle tyres at the big-dealer price, car tyres at the small-dealer price.
-- Families left out keep the normal price (web price book, else the partner's Odoo pricelist).
-- Additive only: one defaulted column on "Dealer".
ALTER TABLE "Dealer" ADD COLUMN IF NOT EXISTS "typePricelists" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "Dealer" DROP CONSTRAINT IF EXISTS "Dealer_typePricelists_check";
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_typePricelists_check" CHECK (jsonb_typeof("typePricelists") = 'object');
