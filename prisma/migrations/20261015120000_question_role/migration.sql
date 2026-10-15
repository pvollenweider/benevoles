-- Poste a sign-up question concerns (#984, part 3): changes of its answers go to that role's
-- sector leaders. Nullable name (roles have no table), kept in step by the role routes. Additive only.
-- AlterTable
ALTER TABLE "EventQuestion" ADD COLUMN     "roleName" TEXT;
