-- Generated assignment proposals (#1172, src/lib/proposal-runs-server.ts). Additive: two new tables,
-- one new column on DraftAssignment (locked, default false) and the foreign key of the existing
-- DraftAssignment.proposalRunId (no code wrote it before this migration: always null).

-- CreateTable
CREATE TABLE "ProposalRun" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stopReason" TEXT,
    "outcome" TEXT,
    "seed" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "replacement" JSONB NOT NULL,
    "snapshot" JSONB,
    "inputVersion" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "hashes" JSONB NOT NULL,
    "solverVersion" TEXT,
    "result" JSONB,
    "progress" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "writtenAt" TIMESTAMP(3),
    "writtenById" TEXT,
    "writtenCount" INTEGER NOT NULL DEFAULT 0,
    "droppedCount" INTEGER NOT NULL DEFAULT 0,
    "written" JSONB,
    "baselineHashes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVolunteerTarget" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventVolunteerTarget_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "DraftAssignment" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;

-- Closed value sets (#321), listed in src/lib/statuses.ts.
ALTER TABLE "ProposalRun" ADD CONSTRAINT "ProposalRun_status_check" CHECK ("status" IN ('queued', 'running', 'finished', 'interrupted', 'failed'));
ALTER TABLE "ProposalRun" ADD CONSTRAINT "ProposalRun_stop_reason_check" CHECK ("stopReason" IN ('budget', 'iterations', 'deadline', 'cancelled', 'lease_expired', 'error'));
ALTER TABLE "ProposalRun" ADD CONSTRAINT "ProposalRun_outcome_check" CHECK ("outcome" IN ('complete', 'incomplete', 'proven_impossible'));
ALTER TABLE "EventVolunteerTarget" ADD CONSTRAINT "EventVolunteerTarget_minutes_check" CHECK ("targetMinutes" >= 0 AND "targetMinutes" <= 43200);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalRun_eventId_idempotencyKey_key" ON "ProposalRun"("eventId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProposalRun_eventId_createdAt_idx" ON "ProposalRun"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ProposalRun_status_createdAt_idx" ON "ProposalRun"("status", "createdAt");

-- At most one run waiting or computing per event.
CREATE UNIQUE INDEX "ProposalRun_one_active_per_event_key" ON "ProposalRun"("eventId") WHERE (status IN ('queued', 'running'));

-- CreateIndex
CREATE UNIQUE INDEX "EventVolunteerTarget_eventId_volunteerId_key" ON "EventVolunteerTarget"("eventId", "volunteerId");

-- CreateIndex
CREATE INDEX "EventVolunteerTarget_volunteerId_idx" ON "EventVolunteerTarget"("volunteerId");

-- CreateIndex
CREATE INDEX "DraftAssignment_proposalRunId_idx" ON "DraftAssignment"("proposalRunId");

-- AddForeignKey
ALTER TABLE "ProposalRun" ADD CONSTRAINT "ProposalRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVolunteerTarget" ADD CONSTRAINT "EventVolunteerTarget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVolunteerTarget" ADD CONSTRAINT "EventVolunteerTarget_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAssignment" ADD CONSTRAINT "DraftAssignment_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "ProposalRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
