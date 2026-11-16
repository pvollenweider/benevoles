-- A person's own workload limits on one event (#1171, lot 2). Additive: a new table only.

-- CreateTable
CREATE TABLE "EventVolunteerLimit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventVolunteerLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventVolunteerLimit_eventId_volunteerId_key" ON "EventVolunteerLimit"("eventId", "volunteerId");
CREATE INDEX "EventVolunteerLimit_volunteerId_idx" ON "EventVolunteerLimit"("volunteerId");

-- AddForeignKey
ALTER TABLE "EventVolunteerLimit" ADD CONSTRAINT "EventVolunteerLimit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVolunteerLimit" ADD CONSTRAINT "EventVolunteerLimit_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
