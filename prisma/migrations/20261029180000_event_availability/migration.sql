-- Dated availability per event and person (#1146, lot A). Additive: new nullable or defaulted
-- columns on Event, and three new tables.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "availabilityAdoptedAt" TIMESTAMP(3),
ADD COLUMN     "availabilityDeadline" TIMESTAMP(3),
ADD COLUMN     "availabilityEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "availabilityTimeZone" TEXT;

-- CreateTable
CREATE TABLE "AvailabilityRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3),
    "answeredBy" TEXT,
    "reviewNeededAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityDay" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRange" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityRequest_volunteerId_idx" ON "AvailabilityRequest"("volunteerId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityRequest_eventId_volunteerId_key" ON "AvailabilityRequest"("eventId", "volunteerId");

-- CreateIndex
CREATE INDEX "AvailabilityDay_eventId_idx" ON "AvailabilityDay"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityDay_requestId_date_key" ON "AvailabilityDay"("requestId", "date");

-- CreateIndex
CREATE INDEX "AvailabilityRange_dayId_idx" ON "AvailabilityRange"("dayId");

-- CreateIndex
CREATE INDEX "AvailabilityRange_eventId_startsAt_idx" ON "AvailabilityRange"("eventId", "startsAt");

-- AddForeignKey
ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityDay" ADD CONSTRAINT "AvailabilityDay_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AvailabilityRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityDay" ADD CONSTRAINT "AvailabilityDay_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRange" ADD CONSTRAINT "AvailabilityRange_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "AvailabilityDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRange" ADD CONSTRAINT "AvailabilityRange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A range always ends after it starts (an overnight range ends the next morning).
ALTER TABLE "AvailabilityRange" ADD CONSTRAINT "AvailabilityRange_order_check" CHECK ("endsAt" > "startsAt");
