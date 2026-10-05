-- Day-of contact of an event (#560): a name and a phone number shown only to registered
-- volunteers, as the fallback of a shift without its own contact. Additive only.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "dayContactName" TEXT,
ADD COLUMN "dayContactPhone" TEXT;
