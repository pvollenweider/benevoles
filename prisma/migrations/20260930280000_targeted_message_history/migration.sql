-- History of targeted messages (#467).
CREATE TABLE "TargetedMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audienceLabel" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetedMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TargetedMessage_eventId_createdAt_idx" ON "TargetedMessage"("eventId", "createdAt");
CREATE INDEX "TargetedMessage_createdAt_idx" ON "TargetedMessage"("createdAt");

ALTER TABLE "TargetedMessage" ADD CONSTRAINT "TargetedMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TargetedMessage" ADD CONSTRAINT "TargetedMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox" ADD COLUMN "targetedMessageId" TEXT;
CREATE INDEX "NotificationOutbox_targetedMessageId_idx" ON "NotificationOutbox"("targetedMessageId");
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_targetedMessageId_fkey" FOREIGN KEY ("targetedMessageId") REFERENCES "TargetedMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
