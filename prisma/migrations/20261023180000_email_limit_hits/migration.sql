-- Sending limits reached (#1100): one row per limit, organisation and hour, with the number of
-- emails held or refused; no address and no content. Additive: a new table, and one nullable
-- column on the outbox (null = never held), no existing row is rewritten.
CREATE TABLE "EmailLimitHit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "organizationId" TEXT,
    "limit" TEXT NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "heldCount" INTEGER NOT NULL DEFAULT 0,
    "refusedCount" INTEGER NOT NULL DEFAULT 0,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLimitHit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailLimitHit_bucket_key" ON "EmailLimitHit"("bucket");
CREATE INDEX "EmailLimitHit_lastAt_idx" ON "EmailLimitHit"("lastAt");
CREATE INDEX "EmailLimitHit_organizationId_lastAt_idx" ON "EmailLimitHit"("organizationId", "lastAt");

ALTER TABLE "EmailLimitHit" ADD CONSTRAINT "EmailLimitHit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox" ADD COLUMN "lastHeldAt" TIMESTAMP(3);
