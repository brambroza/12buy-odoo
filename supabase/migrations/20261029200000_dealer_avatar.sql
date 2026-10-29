-- Dealer profile picture (shop logo), uploaded by the dealer owner.
ALTER TABLE "Dealer" ADD COLUMN IF NOT EXISTS "avatarFile" TEXT;

-- Private bucket for dealer profile pictures (served only through the app's authorised route).
INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT ("id") DO NOTHING;
