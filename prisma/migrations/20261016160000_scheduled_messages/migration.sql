-- Scheduled targeted messages (#1019): the organiser's intent (audience selector, text, push
-- option, due time), picked up by the outbox cron; the recipients are computed when it goes.
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "audienceLabel" TEXT NOT NULL,
    "push" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "claimedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "targetedMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_status_check" CHECK ("status" IN ('scheduled', 'sending', 'sent', 'cancelled', 'skipped'));

CREATE UNIQUE INDEX "ScheduledMessage_targetedMessageId_key" ON "ScheduledMessage"("targetedMessageId");
CREATE INDEX "ScheduledMessage_status_scheduledFor_idx" ON "ScheduledMessage"("status", "scheduledFor");
CREATE INDEX "ScheduledMessage_eventId_scheduledFor_idx" ON "ScheduledMessage"("eventId", "scheduledFor");
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_targetedMessageId_fkey" FOREIGN KEY ("targetedMessageId") REFERENCES "TargetedMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
