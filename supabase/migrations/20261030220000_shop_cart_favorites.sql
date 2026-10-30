-- Dealer favourites ("รายการโปรด"): product ids kept per shop scope next to the cart.
-- Idempotent: safe to run again by hand.
ALTER TABLE "ShopCart" ADD COLUMN IF NOT EXISTS "favorites" JSONB NOT NULL DEFAULT '[]'::jsonb;
