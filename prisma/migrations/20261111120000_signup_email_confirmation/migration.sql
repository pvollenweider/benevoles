-- Confirmation of public sign-ups by email (#1253). Additive: one event option (off for every
-- existing event), one table for a pending request, one link from a registration to it, and the
-- partial unique index now also refuses two live rows for a provisional place.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "requireEmailConfirmation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "signupConfirmationId" TEXT;

-- CreateTable
CREATE TABLE "SignupConfirmation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3),
    "comment" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "resultActive" INTEGER,
    "resultRequested" INTEGER,
    "resultWaiting" INTEGER,
    "charterAcceptedHash" TEXT NOT NULL,
    "charterAcceptedAt" TIMESTAMP(3) NOT NULL,
    "groupLinkId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'public_form',
    "waitlistShiftIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" JSONB,
    "rosterNameVisible" BOOLEAN NOT NULL DEFAULT false,
    "rosterNoticeVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupConfirmation_tokenHash_key" ON "SignupConfirmation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SignupConfirmation_pending_key" ON "SignupConfirmation"("eventId", "email") WHERE "confirmedAt" IS NULL AND "cancelledAt" IS NULL;

-- CreateIndex
CREATE INDEX "SignupConfirmation_eventId_email_idx" ON "SignupConfirmation"("eventId", "email");

-- CreateIndex
CREATE INDEX "SignupConfirmation_expiresAt_confirmedAt_cancelledAt_idx" ON "SignupConfirmation"("expiresAt", "confirmedAt", "cancelledAt");

-- ALTER TABLE (the status list is checked by the database)
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_status_check";
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_status_check" CHECK ("status" IN ('active', 'waiting', 'offered', 'requested', 'unconfirmed', 'cancelled', 'refused', 'deleted'));

-- CreateIndex (the provisional place is a live registration for the one-per-person-and-shift rule)
DROP INDEX "Registration_shift_volunteer_live_key";
CREATE UNIQUE INDEX "Registration_shift_volunteer_live_key" ON "Registration"("shiftId", "volunteerId") WHERE "status" IN ('active', 'waiting', 'offered', 'requested', 'unconfirmed');

-- CreateIndex
CREATE INDEX "Registration_signupConfirmationId_idx" ON "Registration"("signupConfirmationId");

-- AddForeignKey
ALTER TABLE "SignupConfirmation" ADD CONSTRAINT "SignupConfirmation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupConfirmation" ADD CONSTRAINT "SignupConfirmation_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_signupConfirmationId_fkey" FOREIGN KEY ("signupConfirmationId") REFERENCES "SignupConfirmation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
