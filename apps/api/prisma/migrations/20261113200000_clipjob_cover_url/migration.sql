-- Cover/poster image for library thumbnails
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
