-- Owner of a milestone (#985): an admin account of the organisation, optional, cleared when the
-- account is deleted; and when that owner was reminded of the due date. Additive only.
-- AlterTable
ALTER TABLE "EventMilestone" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ownerRemindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EventMilestone_ownerId_idx" ON "EventMilestone"("ownerId");

-- AddForeignKey
ALTER TABLE "EventMilestone" ADD CONSTRAINT "EventMilestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
