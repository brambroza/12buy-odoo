-- Images uploaded from /admin/landing (hero, banners). Kept private: the app serves them through
-- /api/landing-images/[name] so file names stay validated and no bucket URL is exposed.
-- Landing text lives in the existing "AppSetting" table (key 'landing'), so no table change here.
-- Idempotent: safe to run again by hand (e.g. in the Supabase SQL editor).
INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('landing', 'landing', false, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT ("id") DO NOTHING;
