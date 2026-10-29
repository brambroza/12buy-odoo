-- Prisma is gone; its bookkeeping table is the only public table without RLS, so the anon key could read it via the Data API.
-- Lock it instead of dropping it (keeps history). Safe to drop later with: DROP TABLE "_prisma_migrations";
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
