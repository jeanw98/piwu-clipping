-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "memorySummary" TEXT NOT NULL DEFAULT '',
    "defaultVisualStyle" TEXT,
    "defaultMotion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAssetCache" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "byteLength" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAssetCache_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ClipJob" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ClipJob" ADD COLUMN "referenceMeta" JSONB;

-- CreateIndex
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectReference_projectId_role_idx" ON "ProjectReference"("projectId", "role");

-- CreateIndex
CREATE INDEX "ProjectAssetCache_projectId_idx" ON "ProjectAssetCache"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssetCache_projectId_promptHash_assetType_key" ON "ProjectAssetCache"("projectId", "promptHash", "assetType");

-- CreateIndex
CREATE INDEX "ClipJob_projectId_idx" ON "ClipJob"("projectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReference" ADD CONSTRAINT "ProjectReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssetCache" ADD CONSTRAINT "ProjectAssetCache_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipJob" ADD CONSTRAINT "ClipJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
