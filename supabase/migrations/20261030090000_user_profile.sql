-- Staff profile: contact phone and profile picture (stored in the existing private `avatars` bucket).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarFile" TEXT;
