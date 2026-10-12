-- Volunteer self-cancellation deadline (#946): null = until the shift starts (default for every event).
ALTER TABLE "Event" ADD COLUMN "cancelDeadlineDays" INTEGER;
ALTER TABLE "Event" ADD COLUMN "cancelDeadlineHours" INTEGER;
