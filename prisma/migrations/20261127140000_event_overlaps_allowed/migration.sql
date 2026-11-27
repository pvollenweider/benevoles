-- Overlapping shifts allowed for a whole event (#1467): off by default, so every existing event
-- keeps exactly the per-poste rule until an organiser turns it on. Additive, no data change.
ALTER TABLE "Event" ADD COLUMN "overlapsAllowed" BOOLEAN NOT NULL DEFAULT false;
