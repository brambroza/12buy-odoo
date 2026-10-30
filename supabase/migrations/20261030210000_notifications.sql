-- In-app + LINE notifications for dealers and staff, and the LINE account linked to a login.
-- A row is written for every event (in-app inbox); `channels` records what else was sent and how it went.
-- Idempotent: safe to run again by hand.
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    -- Who sees it: a dealer (every user of the shop) or one staff member. At least one is set.
    "dealerId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    -- e.g. {"line": {"ok": true, "to": 2}} or {"line": {"ok": false, "error": "..."}}
    "channels" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_dealerId_createdAt_idx" ON "Notification"("dealerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

-- LINE user id (from LINE Login) of a web login; LINE pushes go here.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lineUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lineLinkedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_lineUserId_idx" ON "User"("lineUserId");
