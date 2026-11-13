-- ClipJob fields added in schema but never migrated
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "durationSec" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "orientation" TEXT NOT NULL DEFAULT 'portrait';
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "resolution" TEXT NOT NULL DEFAULT '1080p';
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'tiktok';
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'es-LA';
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'prompt';
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "captionStyle" JSONB;
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "clipCount" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "visualStyle" TEXT NOT NULL DEFAULT 'ugc';
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "motion" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "scriptJson" JSONB;
ALTER TABLE "ClipJob" ADD COLUMN IF NOT EXISTS "referenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- YouTube highlight variants
CREATE TABLE IF NOT EXISTS "ClipVariant" (
    "id" TEXT NOT NULL,
    "clipJobId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "outputVideoUrl" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClipVariant_clipJobId_index_key" ON "ClipVariant"("clipJobId", "index");
CREATE INDEX IF NOT EXISTS "ClipVariant_clipJobId_score_idx" ON "ClipVariant"("clipJobId", "score");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClipVariant_clipJobId_fkey'
  ) THEN
    ALTER TABLE "ClipVariant"
      ADD CONSTRAINT "ClipVariant_clipJobId_fkey"
      FOREIGN KEY ("clipJobId") REFERENCES "ClipJob"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
