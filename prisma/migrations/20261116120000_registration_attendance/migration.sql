-- Absence recorded by an organizer (#1141). Additive and nullable: the previous release ignores
-- the columns, so a rolling deployment stays compatible. `attendanceStatus` is null or "absent"
-- in this release ("left_early" is reserved for a later PR and refused by the routes here);
-- `attendanceAt` and `attendanceBy` are the server time and the AdminUser id of that absence,
-- without a foreign key: the account may be deleted later.
ALTER TABLE "Registration" ADD COLUMN "attendanceStatus" TEXT;
ALTER TABLE "Registration" ADD COLUMN "attendanceAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "attendanceBy" TEXT;
