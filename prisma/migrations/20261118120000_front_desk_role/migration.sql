-- Front-desk access limited to one event (#1142): let the stored role "front_desk" exist.
--
-- Widens the CHECK constraint on "AdminUser"."role" created by 20260930340000_organizer_role,
-- without touching any row. Rolling deployment: the previous application version never writes
-- "front_desk" (its team routes and pickers only know "admin", "organizer" and "super_admin"),
-- so it keeps working unchanged while this constraint is in place. The new version starts
-- writing the value only once the new routes and their owner screens are deployed.
ALTER TABLE "AdminUser" DROP CONSTRAINT "AdminUser_role_check";
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_role_check" CHECK ("role" IN ('admin', 'organizer', 'super_admin', 'front_desk'));
