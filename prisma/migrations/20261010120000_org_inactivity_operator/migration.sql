-- Periodic check of inactive organisations (#811): the operator can postpone it or exclude an
-- organisation for good. Both default to « nothing changes ».
ALTER TABLE "Organization" ADD COLUMN "inactivityPostponedUntil" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "inactivityExempt" BOOLEAN NOT NULL DEFAULT false;
