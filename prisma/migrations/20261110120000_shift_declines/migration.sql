-- « Je ne peux pas » for one shift (#1303). Additive: one new table, one row per (volunteer,
-- shift), with its answer date. Both foreign keys cascade: with the shift or with the member.

-- CreateTable
CREATE TABLE "ShiftDecline" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "declinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftDecline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDecline_shiftId_volunteerId_key" ON "ShiftDecline"("shiftId", "volunteerId");

-- CreateIndex
CREATE INDEX "ShiftDecline_volunteerId_idx" ON "ShiftDecline"("volunteerId");

-- AddForeignKey
ALTER TABLE "ShiftDecline" ADD CONSTRAINT "ShiftDecline_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftDecline" ADD CONSTRAINT "ShiftDecline_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
