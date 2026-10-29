-- The link « Indiquer mes disponibilités » (#1146, lot A): its own secret per person and event,
-- and when its email went. Additive: nullable columns and a unique index on a table that is empty
-- in production (the capability was never shipped before this migration).

-- AlterTable
ALTER TABLE "AvailabilityRequest" ADD COLUMN     "lastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "token" TEXT,
ADD COLUMN     "tokenEnc" TEXT,
ADD COLUMN     "tokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityRequest_tokenHash_key" ON "AvailabilityRequest"("tokenHash");
