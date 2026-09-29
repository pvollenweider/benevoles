-- Email delivery page per organization (#382): rows carry the organization they belong to, so
-- admins can see their own pending, failed and sent notifications. Nullable: rows enqueued
-- before this migration, and the rare system-level ones, have none.
ALTER TABLE "NotificationOutbox" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "NotificationOutbox_organizationId_createdAt_idx" ON "NotificationOutbox"("organizationId", "createdAt");
