-- Shift swaps between volunteers (#1174, beta capability « shiftSwaps »). Additive, safe for pods
-- still running the previous code: a new table and defaulted columns, no rewrite of existing data.
-- Every existing event keeps swaps off (shiftSwapsEnabled false); the organisation's default only
-- applies to new events, and only while the capability can be adopted.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "shiftSwapsDefault" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "shiftSwapsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "shiftSwapsApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShiftSwapRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "registrationId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "counterRegistrationId" TEXT,
    "counterVolunteerId" TEXT,
    "counterShiftId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "termsHash" TEXT,
    "shiftHash" TEXT NOT NULL,
    "declinedVolunteerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "offeredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_eventId_status_idx" ON "ShiftSwapRequest"("eventId", "status");
CREATE INDEX "ShiftSwapRequest_registrationId_idx" ON "ShiftSwapRequest"("registrationId");
CREATE INDEX "ShiftSwapRequest_counterRegistrationId_idx" ON "ShiftSwapRequest"("counterRegistrationId");

-- One open request per registration, on either side of it (the cross-side check runs under the
-- volunteer lock in src/lib/shift-swap-server.ts): backstops a double submit racing itself.
CREATE UNIQUE INDEX "ShiftSwapRequest_registration_live_key" ON "ShiftSwapRequest"("registrationId") WHERE (status IN ('open', 'offered', 'approval'));
CREATE UNIQUE INDEX "ShiftSwapRequest_counter_live_key" ON "ShiftSwapRequest"("counterRegistrationId") WHERE (status IN ('offered', 'approval'));

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A counterpart registration deleted (member deletion) only clears the offer: the request's own
-- registration and history stay, and applying it then fails as impossible.
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_counterRegistrationId_fkey" FOREIGN KEY ("counterRegistrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
