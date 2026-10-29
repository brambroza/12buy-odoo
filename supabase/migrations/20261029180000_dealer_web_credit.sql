-- Web credit line per dealer. Additive only: two nullable/defaulted columns on "Dealer".
-- "creditLimit" NULL = no web limit (only Odoo's credit_limit applies, if any).
-- "creditOpening" = debt carried over from before the web (unpaid Odoo invoices); admin lowers it as the dealer pays.
-- Used credit = creditOpening + totals of the dealer's CREDIT orders that are neither PAID nor CANCELLED,
-- so marking an order paid (or cancelling it) gives the amount back without a separate ledger.
ALTER TABLE "Dealer" ADD COLUMN "creditLimit" NUMERIC(14,2);
ALTER TABLE "Dealer" ADD COLUMN "creditOpening" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_creditLimit_check" CHECK ("creditLimit" IS NULL OR "creditLimit" >= 0);
ALTER TABLE "Dealer" ADD CONSTRAINT "Dealer_creditOpening_check" CHECK ("creditOpening" >= 0);
