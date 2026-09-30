-- Optional limit of shifts per volunteer for a role (#466), shared by the role's shifts like colorKey.
ALTER TABLE "Shift" ADD COLUMN "maxPerVolunteer" INTEGER;
