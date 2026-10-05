-- Erasure of a member's personal data (#516): a marker on the anonymised record, and a register
-- without personal data to replay erasures after a restore. Additive only: a nullable column and
-- a new table, nothing existing is rewritten.

-- AlterTable
ALTER TABLE "Volunteer" ADD COLUMN     "erasedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ErasureRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "emailHash" TEXT,
    "erasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErasureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErasureRecord_volunteerId_key" ON "ErasureRecord"("volunteerId");

-- CreateIndex
CREATE INDEX "ErasureRecord_organizationId_erasedAt_idx" ON "ErasureRecord"("organizationId", "erasedAt");

-- AddForeignKey
ALTER TABLE "ErasureRecord" ADD CONSTRAINT "ErasureRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
