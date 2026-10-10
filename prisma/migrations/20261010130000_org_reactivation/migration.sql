-- #811: a space deactivated for lack of activity, and the single-use link that lets one of its
-- administrators reactivate it.
ALTER TABLE "Organization" ADD COLUMN "inactivityDeactivatedAt" TIMESTAMP(3);
ALTER TABLE "AdminUser" ADD COLUMN "orgReactivationTokenHash" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "orgReactivationExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "AdminUser_orgReactivationTokenHash_key" ON "AdminUser"("orgReactivationTokenHash");
