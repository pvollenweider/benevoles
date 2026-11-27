-- Shifts grouped by sector on the sign-up page (#1469): off by default, so no existing event shows
-- its sector names to volunteers until an organiser turns it on. Additive, no data change.
ALTER TABLE "Event" ADD COLUMN "publicSectorGrouping" BOOLEAN NOT NULL DEFAULT false;
