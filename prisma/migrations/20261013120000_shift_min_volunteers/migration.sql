-- Minimum per shift (#949): null = the same as the places, so existing shifts don't change.
ALTER TABLE "Shift" ADD COLUMN "minVolunteers" INTEGER;
-- 1 ≤ minimum ≤ places, also when the places change afterwards. The API refuses it first, with a
-- message; this only guards the data.
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_minVolunteers_check" CHECK ("minVolunteers" IS NULL OR ("minVolunteers" >= 1 AND "minVolunteers" <= "capacity"));
