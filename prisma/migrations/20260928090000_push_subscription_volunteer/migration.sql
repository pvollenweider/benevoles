DELETE FROM "PushSubscription";

-- DropIndex
DROP INDEX "PushSubscription_endpoint_key";

-- DropIndex
DROP INDEX "PushSubscription_email_idx";

-- AlterTable
ALTER TABLE "PushSubscription" DROP COLUMN "email",
ADD COLUMN     "volunteerId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "PushSubscription_volunteerId_idx" ON "PushSubscription"("volunteerId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_volunteerId_key" ON "PushSubscription"("endpoint", "volunteerId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
