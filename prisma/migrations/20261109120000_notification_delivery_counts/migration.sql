-- Aggregated delivery counts of the transactional emails (#1269), folded before the outbox purge:
-- no recipient, no address, no content, no member id.
--
-- `organizationKey` is the organisation id, or 'platform' for emails without one: a unique index
-- treats every NULL as distinct, so a nullable organizationId in the key would let two cleanups
-- create two platform rows. `organizationId` stays nullable for the cascade with the organisation.
CREATE TABLE "NotificationDeliveryCount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "organizationKey" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDeliveryCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationDeliveryCount_organizationId_day_idx" ON "NotificationDeliveryCount"("organizationId", "day");

-- CreateIndex
CREATE INDEX "NotificationDeliveryCount_day_idx" ON "NotificationDeliveryCount"("day");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDeliveryCount_organizationKey_day_kind_outcome__key" ON "NotificationDeliveryCount"("organizationKey", "day", "kind", "outcome", "reason");

-- AddForeignKey
ALTER TABLE "NotificationDeliveryCount" ADD CONSTRAINT "NotificationDeliveryCount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
