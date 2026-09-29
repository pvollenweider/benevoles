-- Optional general availability of a volunteer (#402): periods of the day and a short note.
-- Additive: an empty array and null by default, nothing rewritten.

-- AlterTable
ALTER TABLE "Volunteer" ADD COLUMN     "availabilityNote" TEXT,
ADD COLUMN     "availabilityPeriods" TEXT[] DEFAULT ARRAY[]::TEXT[];
