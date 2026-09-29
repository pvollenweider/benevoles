-- Per-organization time zone (#344). Nullable: null keeps the deployment default (APP_TIME_ZONE),
-- so existing organizations and the previous code are unaffected.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timeZone" TEXT;
