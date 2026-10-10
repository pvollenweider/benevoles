-- #866 recurring permanences: the rule, and the link from each generated shift (expand only).
CREATE TABLE "ShiftRecurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "everyWeeks" INTEGER NOT NULL DEFAULT 1,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "untilDate" TIMESTAMP(3) NOT NULL,
    "holidays" TEXT NOT NULL DEFAULT 'none',
    "closures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftRecurrence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShiftRecurrence_eventId_idx" ON "ShiftRecurrence"("eventId");
ALTER TABLE "ShiftRecurrence" ADD CONSTRAINT "ShiftRecurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Shift" ADD COLUMN "recurrenceId" TEXT;
CREATE INDEX "Shift_recurrenceId_idx" ON "Shift"("recurrenceId");
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "ShiftRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
