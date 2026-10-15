-- A role whose shifts may overlap any other shift of the same volunteer (#986), shared by the
-- role's shifts like colorKey and maxPerVolunteer.
ALTER TABLE "Shift" ADD COLUMN "overlapAllowed" BOOLEAN NOT NULL DEFAULT false;
