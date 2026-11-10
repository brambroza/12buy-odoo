-- Incentive on invoices: the bonus ladder can be measured on posted customer invoices of the period
-- (by invoice date, before VAT, credit notes deducted), stored in "CommissionSaleOrder" like sale orders.
-- Idempotent; run once in the Supabase SQL Editor (after 20261110150000_commission_sale_orders.sql).
ALTER TABLE "CommissionSource" DROP CONSTRAINT IF EXISTS "CommissionSource_bonusBase_check";
ALTER TABLE "CommissionSource"
    ADD CONSTRAINT "CommissionSource_bonusBase_check" CHECK ("bonusBase" IN ('COLLECTION', 'SALE_ORDER', 'INVOICE'));

NOTIFY pgrst, 'reload schema';
