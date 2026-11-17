-- Share link for one shift (#1386): « Partager ce créneau », a public link to a shift that still
-- needs people. Additive: one new table, one nullable column on Registration. The previous release
-- ignores both and keeps working.
--
-- One link per shift (shiftId unique), a random code unique across the platform, and
-- Registration.shiftShareLinkId to count the sign-ups a link brought. Both foreign keys cascade
-- with the event and the shift; deleting a link keeps its registrations and clears their reference
-- (ON DELETE SET NULL).

-- CreateTable
CREATE TABLE "ShiftShareLink" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "acceptsAfterClose" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftShareLink_shiftId_key" ON "ShiftShareLink"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftShareLink_code_key" ON "ShiftShareLink"("code");

-- CreateIndex
CREATE INDEX "ShiftShareLink_eventId_idx" ON "ShiftShareLink"("eventId");

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "shiftShareLinkId" TEXT;

-- CreateIndex
CREATE INDEX "Registration_shiftShareLinkId_idx" ON "Registration"("shiftShareLinkId");

-- AddForeignKey
ALTER TABLE "ShiftShareLink" ADD CONSTRAINT "ShiftShareLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftShareLink" ADD CONSTRAINT "ShiftShareLink_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_shiftShareLinkId_fkey" FOREIGN KEY ("shiftShareLinkId") REFERENCES "ShiftShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
