-- Shared rate-limit counters for login / sign-up / reset / activation, so every server instance
-- sees the same numbers. `rate_limit_hit` bumps the counter atomically and restarts the window when
-- it has expired. Idempotent: safe to run again by hand.
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "RateLimit" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION rate_limit_hit(p_key TEXT, p_window_ms INTEGER)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    now_ts TIMESTAMP(3) := (now() AT TIME ZONE 'utc');
    win INTERVAL := make_interval(secs => p_window_ms / 1000.0);
    r "RateLimit"%ROWTYPE;
BEGIN
    INSERT INTO "RateLimit" ("key", "count", "windowStart", "updatedAt")
    VALUES (p_key, 1, now_ts, now_ts)
    ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" + win <= now_ts THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" + win <= now_ts THEN now_ts ELSE "RateLimit"."windowStart" END,
        "updatedAt" = now_ts
    RETURNING * INTO r;

    -- Opportunistic cleanup (about 1 in 100 calls): drop windows nobody touched for a day.
    IF random() < 0.01 THEN
        DELETE FROM "RateLimit" WHERE "updatedAt" < now_ts - INTERVAL '1 day';
    END IF;

    RETURN json_build_object('count', r."count", 'windowStart', r."windowStart");
END
$$;
