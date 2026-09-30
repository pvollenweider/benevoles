-- Coordinates of an event's place and of a shift's meeting point (#191): typed once by the
-- organiser, turned into a map link for volunteers. Nullable; a shift without its own falls back
-- to the event's.
ALTER TABLE "Event" ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Shift" ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION;
