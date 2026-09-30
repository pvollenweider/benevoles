-- The organiser role (#469) was never allowed by the CHECK constraint added in #321, so inviting
-- an organiser failed with a constraint violation. Widening only: every value the previous code
-- writes stays valid.
ALTER TABLE "AdminUser" DROP CONSTRAINT "AdminUser_role_check";
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_role_check" CHECK ("role" IN ('admin', 'organizer', 'super_admin'));
