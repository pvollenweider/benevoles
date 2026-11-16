-- A role assigned by the organisation only (#1145): never offered publicly, shared by the role's
-- shifts like overlapAllowed. Additive, default false: public behaviour unchanged.
ALTER TABLE "Shift" ADD COLUMN "assignedOnly" BOOLEAN NOT NULL DEFAULT false;
