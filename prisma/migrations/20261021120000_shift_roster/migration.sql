-- Shift roster between volunteers (#1068). Additive: the setting is off for every existing event,
-- and no volunteer has a choice yet, so nobody is shown anywhere until they opt in.
ALTER TABLE "Event" ADD COLUMN "shiftRosterEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "RosterConsent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RosterConsent_eventId_volunteerId_key" ON "RosterConsent"("eventId", "volunteerId");
CREATE INDEX "RosterConsent_volunteerId_idx" ON "RosterConsent"("volunteerId");

ALTER TABLE "RosterConsent" ADD CONSTRAINT "RosterConsent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RosterConsent" ADD CONSTRAINT "RosterConsent_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
