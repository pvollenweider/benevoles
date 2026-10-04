-- Member merge (#600): the absorbed record becomes an inactive tombstone, mapped to the kept
-- record so old ids keep resolving. Additive only: both columns are nullable, nothing rewritten.

-- AlterTable
ALTER TABLE "Volunteer" ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "mergedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Volunteer_mergedIntoId_idx" ON "Volunteer"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
