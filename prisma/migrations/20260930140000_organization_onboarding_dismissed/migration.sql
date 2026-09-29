-- First-run checklist hidden by an admin (#369). Nullable: existing organizations keep seeing
-- the checklist only while its required steps aren't done (derived from their data).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "onboardingDismissedAt" TIMESTAMP(3);
