-- Self-hosted release check (#612): is the instance's version behind the latest GitHub release.

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "releaseBannerDismissedVersion" TEXT;

-- CreateTable
CREATE TABLE "ReleaseCheckState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "latestVersion" TEXT,
    "releaseUrl" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastNotifiedVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseCheckState_pkey" PRIMARY KEY ("id")
);
