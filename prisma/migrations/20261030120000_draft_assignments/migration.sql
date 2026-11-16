-- Draft assignments and their publications (#1146, lot C, src/lib/draft-assignments.ts). Additive:
-- two new tables, and one more allowed value of Registration.source, « admin_draft » (a registration
-- created by publishing drafts), widened before any code writes it (expand/contract).

-- CreateTable
CREATE TABLE "DraftAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "proposalRunId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdById" TEXT,
    "shiftTerms" TEXT NOT NULL,
    "availabilityStamp" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" TEXT,
    "ackKey" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "publicationId" TEXT,
    "registrationId" TEXT,
    "discardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPublication" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actorId" TEXT,
    "draftCount" INTEGER NOT NULL DEFAULT 0,
    "personCount" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPublication_pkey" PRIMARY KEY ("id")
);

-- Closed value sets (#321), listed in src/lib/statuses.ts.
ALTER TABLE "DraftAssignment" ADD CONSTRAINT "DraftAssignment_status_check" CHECK ("status" IN ('draft', 'published', 'discarded'));
ALTER TABLE "DraftAssignment" ADD CONSTRAINT "DraftAssignment_source_check" CHECK ("source" IN ('manual', 'proposal'));
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_source_check";
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_source_check" CHECK ("source" IN ('public_form', 'admin_manual', 'admin_draft'));

-- CreateIndex
CREATE INDEX "DraftAssignment_eventId_status_idx" ON "DraftAssignment"("eventId", "status");

-- CreateIndex
CREATE INDEX "DraftAssignment_eventId_volunteerId_status_idx" ON "DraftAssignment"("eventId", "volunteerId", "status");

-- CreateIndex
CREATE INDEX "DraftAssignment_volunteerId_idx" ON "DraftAssignment"("volunteerId");

-- CreateIndex
CREATE INDEX "DraftAssignment_publicationId_idx" ON "DraftAssignment"("publicationId");

-- One pending draft per person and shift (published and discarded rows are kept as provenance).
CREATE UNIQUE INDEX "DraftAssignment_shift_volunteer_pending_key" ON "DraftAssignment"("shiftId", "volunteerId") WHERE (status = 'draft');

-- CreateIndex
CREATE UNIQUE INDEX "DraftPublication_eventId_idempotencyKey_key" ON "DraftPublication"("eventId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "DraftAssignment" ADD CONSTRAINT "DraftAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAssignment" ADD CONSTRAINT "DraftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAssignment" ADD CONSTRAINT "DraftAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAssignment" ADD CONSTRAINT "DraftAssignment_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "DraftPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPublication" ADD CONSTRAINT "DraftPublication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
