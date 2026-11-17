-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "runHour" INTEGER NOT NULL,
    "runMinute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/Guayaquil',
    "topicHint" TEXT NOT NULL DEFAULT '',
    "useTrends" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT,
    "blocks" JSONB NOT NULL,
    "lastScheduledDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "localDate" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "items" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "zipPath" TEXT,
    "zipName" TEXT,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ClipJob" ADD COLUMN "automationRunId" TEXT;

-- CreateIndex
CREATE INDEX "Automation_userId_idx" ON "Automation"("userId");
CREATE UNIQUE INDEX "AutomationRun_automationId_seq_key" ON "AutomationRun"("automationId", "seq");
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");
CREATE INDEX "ClipJob_automationRunId_idx" ON "ClipJob"("automationRunId");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipJob" ADD CONSTRAINT "ClipJob_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
