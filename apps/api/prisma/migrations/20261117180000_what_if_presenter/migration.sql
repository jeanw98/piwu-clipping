-- AlterTable
ALTER TABLE "User" ADD COLUMN "presenterUrl" TEXT,
ADD COLUMN "presenterName" TEXT,
ADD COLUMN "presenterAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClipJob" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN "presenterUrl" TEXT;
