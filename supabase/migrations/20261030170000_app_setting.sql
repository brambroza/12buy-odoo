-- Key/value settings edited from the back office (first use: the Odoo connection, with the API key
-- encrypted by the app before it is stored). Env vars stay the fallback when a key has no row.
-- Idempotent: safe to run again by hand (e.g. in the Supabase SQL editor).
CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
