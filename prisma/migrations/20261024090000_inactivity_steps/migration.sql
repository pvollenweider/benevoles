-- Inactivity procedure, three confirmed messages (#1114). Additive: a new table, two nullable
-- columns on Organization and one on the outbox (null = not an inactivity email); no existing row
-- rewritten. A procedure already under way (inactivityNoticeAt set, no step) is left as it is: the
-- nightly run shows it for manual handling and never restarts nor deactivates it on its own.
CREATE TABLE "OrgInactivityStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "recipientHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plannedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInactivityStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgInactivityStep_organizationId_step_key" ON "OrgInactivityStep"("organizationId", "step");
ALTER TABLE "OrgInactivityStep" ADD CONSTRAINT "OrgInactivityStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Organization" ADD COLUMN "inactivityPlannedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "inactivityBlockedAt" TIMESTAMP(3);

ALTER TABLE "NotificationOutbox" ADD COLUMN "inactivityStepId" TEXT;
CREATE INDEX "NotificationOutbox_inactivityStepId_idx" ON "NotificationOutbox"("inactivityStepId");
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_inactivityStepId_fkey" FOREIGN KEY ("inactivityStepId") REFERENCES "OrgInactivityStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
