-- Front-desk access of one account to one event (#1142), groundwork. Additive: one new table,
-- nothing renamed, dropped, backfilled or constrained on an existing table, so the previous
-- release keeps running unchanged during a rolling deployment (it never reads this table).
--
-- One row per account and event. A grant counts only while it is neither revoked nor expired and
-- its event is not archived (src/lib/front-desk-access.ts). `organizationId` is denormalised from
-- the event for tenant scoping; `createdById` is an AdminUser id without a foreign key (the
-- granting account may be deleted later).
--
-- The CHECK constraint on "AdminUser"."role" is left as it is: it does not allow 'front_desk'
-- yet, so no such account can exist until the change that provisions them widens it.
CREATE TABLE "AdminEventAccess" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminEventAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminEventAccess_adminUserId_eventId_key" ON "AdminEventAccess"("adminUserId", "eventId");

CREATE INDEX "AdminEventAccess_eventId_idx" ON "AdminEventAccess"("eventId");

CREATE INDEX "AdminEventAccess_adminUserId_idx" ON "AdminEventAccess"("adminUserId");

ALTER TABLE "AdminEventAccess" ADD CONSTRAINT "AdminEventAccess_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminEventAccess" ADD CONSTRAINT "AdminEventAccess_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
