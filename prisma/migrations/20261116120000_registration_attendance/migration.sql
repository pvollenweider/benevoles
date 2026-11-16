-- Absence recorded by an organizer (#1141). Additive and nullable: nothing is renamed, dropped
-- or backfilled, and the previous release keeps reading and writing the table as before.
-- `attendanceStatus` is null or "absent" in this release ("left_early" is reserved for a later PR
-- and refused by the routes here); `attendanceAt` and `attendanceBy` are the server time and the
-- AdminUser id of that absence, without a foreign key: the account may be deleted later.
--
-- During a rolling deployment the previous release still runs for a short time and does not know
-- these columns: it shows a person marked absent as not marked, and its check-in sets
-- `checkedInAt` on such a row without clearing `attendanceStatus`. The application therefore
-- reads a row with a check-in time as present whatever `attendanceStatus` says
-- (src/lib/attendance-state.ts), and « Annuler la présence » accepts that row and writes the
-- four columns back to null. No constraint enforces the exclusion in the database for that reason.
ALTER TABLE "Registration" ADD COLUMN "attendanceStatus" TEXT;
ALTER TABLE "Registration" ADD COLUMN "attendanceAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "attendanceBy" TEXT;
