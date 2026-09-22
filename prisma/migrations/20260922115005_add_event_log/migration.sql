-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "causedByLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventLog_eventId_createdAt_idx" ON "EventLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventLog_causedByLogId_idx" ON "EventLog"("causedByLogId");

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_causedByLogId_fkey" FOREIGN KEY ("causedByLogId") REFERENCES "EventLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
