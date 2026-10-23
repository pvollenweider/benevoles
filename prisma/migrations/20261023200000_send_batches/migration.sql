-- Bulk send history (#1101): one row per batch of emails sent at once from an event, with its
-- delivery counters; no recipient, no address, no content. Additive: a new table, two nullable
-- columns on the outbox (null = sent outside any batch, or never held), no existing row rewritten.
CREATE TABLE "SendBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "heldSentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "maxHeldWaitSec" INTEGER NOT NULL DEFAULT 0,
    "targetedMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SendBatch_targetedMessageId_key" ON "SendBatch"("targetedMessageId");
CREATE INDEX "SendBatch_organizationId_eventId_createdAt_idx" ON "SendBatch"("organizationId", "eventId", "createdAt");
CREATE INDEX "SendBatch_organizationId_createdAt_idx" ON "SendBatch"("organizationId", "createdAt");
CREATE INDEX "SendBatch_createdAt_idx" ON "SendBatch"("createdAt");

ALTER TABLE "SendBatch" ADD CONSTRAINT "SendBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SendBatch" ADD CONSTRAINT "SendBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SendBatch" ADD CONSTRAINT "SendBatch_targetedMessageId_fkey" FOREIGN KEY ("targetedMessageId") REFERENCES "TargetedMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox" ADD COLUMN "firstHeldAt" TIMESTAMP(3);
ALTER TABLE "NotificationOutbox" ADD COLUMN "sendBatchId" TEXT;
CREATE INDEX "NotificationOutbox_sendBatchId_idx" ON "NotificationOutbox"("sendBatchId");
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_sendBatchId_fkey" FOREIGN KEY ("sendBatchId") REFERENCES "SendBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
